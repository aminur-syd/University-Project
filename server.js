require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://stogzhtvnvobmhvoqxuy.supabase.co';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'Chat-proofs';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_SIGNED_URL_TTL_SECONDS = Math.max(
    60,
    Math.min(24 * 60 * 60, Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS || 3600))
);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'lost-and-found-16023';
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const GOOGLE_SECURETOKEN_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'pdf',
    'doc',
    'docx',
    'txt',
    'zip',
    'rar'
]);

const ALLOWED_ATTACHMENT_MIME_PATTERNS = [
    /^image\//,
    /^application\/pdf$/,
    /^text\/plain$/,
    /^application\/msword$/,
    /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
    /^application\/zip$/,
    /^application\/x-zip-compressed$/,
    /^application\/vnd\.rar$/,
    /^application\/x-rar-compressed$/
];

const app = express();
const firebaseJwks = createRemoteJWKSet(new URL(GOOGLE_SECURETOKEN_JWKS_URL));
const supabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    })
    : null;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES
    }
});

function getFileExtension(fileName) {
    const parts = String(fileName || '').toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
}

function sanitizeFileName(fileName) {
    return String(fileName || 'attachment')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120) || 'attachment';
}

function sanitizePathSegment(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
}

function normalizeAttachmentPath(filePath) {
    const normalizedPath = String(filePath || '').replace(/^\/+/, '').trim();

    if (!normalizedPath || normalizedPath.includes('..')) {
        return '';
    }

    return normalizedPath;
}

function resolveAttachmentContentType(file) {
    const browserType = String(file?.mimetype || '').toLowerCase();
    const extension = getFileExtension(file?.originalname || '');

    if (ALLOWED_ATTACHMENT_MIME_PATTERNS.some((pattern) => pattern.test(browserType))) {
        return browserType;
    }

    if (['jpg', 'jpeg'].includes(extension)) return 'image/jpeg';
    if (extension === 'png') return 'image/png';
    if (extension === 'gif') return 'image/gif';
    if (extension === 'webp') return 'image/webp';
    if (extension === 'pdf') return 'application/pdf';
    if (extension === 'doc') return 'application/msword';
    if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (extension === 'txt') return 'text/plain';
    if (extension === 'zip') return 'application/zip';
    if (extension === 'rar') return 'application/x-rar-compressed';

    return browserType;
}

function getAttachmentKind(file) {
    const contentType = String(file?.mimetype || file?.contentType || '').toLowerCase();
    const extension = getFileExtension(file?.originalname || file?.name || '');

    if (contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
        return 'image';
    }

    return 'file';
}

function validateIncomingAttachment(file) {
    if (!file) {
        return 'Please choose a file first.';
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        return 'File must be 10 MB or smaller.';
    }

    const extension = getFileExtension(file.originalname);
    const mimeType = String(file.mimetype || '').toLowerCase();
    const isAcceptedByMime = ALLOWED_ATTACHMENT_MIME_PATTERNS.some((pattern) => pattern.test(mimeType));
    const isAcceptedByExtension = ALLOWED_ATTACHMENT_EXTENSIONS.has(extension);

    if (!isAcceptedByMime && !isAcceptedByExtension) {
        return 'Use a common proof file such as image, PDF, DOC, DOCX, TXT, ZIP, or RAR.';
    }

    return '';
}

function getBearerToken(request) {
    const authorizationHeader = request.headers.authorization || '';

    if (!authorizationHeader.startsWith('Bearer ')) {
        return '';
    }

    return authorizationHeader.slice('Bearer '.length).trim();
}

async function verifyFirebaseIdToken(idToken) {
    const { payload } = await jwtVerify(idToken, firebaseJwks, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID
    });

    return payload;
}

async function authenticateRequest(request, response, next) {
    const idToken = getBearerToken(request);

    if (!idToken) {
        response.status(401).json({ error: 'Missing Firebase auth token.' });
        return;
    }

    try {
        const tokenPayload = await verifyFirebaseIdToken(idToken);
        request.authToken = idToken;
        request.authUser = tokenPayload;
        next();
    } catch (error) {
        console.error('Firebase token verification failed:', error);
        response.status(401).json({ error: 'Invalid Firebase auth token.' });
    }
}

async function assertServerConfigured() {
    if (!supabase) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
    }
}

async function assertChatAccess(idToken, chatId) {
    const sanitizedChatId = sanitizePathSegment(chatId);

    if (!sanitizedChatId) {
        throw new Error('Invalid chat ID.');
    }

    const firestoreResponse = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/chats/${encodeURIComponent(sanitizedChatId)}`,
        {
            headers: {
                Authorization: `Bearer ${idToken}`
            }
        }
    );

    if (!firestoreResponse.ok) {
        if (firestoreResponse.status === 403 || firestoreResponse.status === 404) {
            const accessError = new Error('You do not have access to this chat.');
            accessError.status = 403;
            throw accessError;
        }

        const bodyText = await firestoreResponse.text();
        const accessError = new Error(`Could not validate chat access. ${bodyText}`);
        accessError.status = 502;
        throw accessError;
    }

    return sanitizedChatId;
}

function extractChatIdFromAttachmentPath(filePath) {
    const parts = normalizeAttachmentPath(filePath).split('/');

    if (parts.length < 4 || parts[0] !== 'chat-attachments') {
        return '';
    }

    return sanitizePathSegment(parts[1]);
}

function formatAttachmentPayload(file, filePath) {
    const contentType = resolveAttachmentContentType(file);

    return {
        name: file.originalname,
        path: filePath,
        contentType: contentType || '',
        size: file.size,
        kind: getAttachmentKind(file),
        provider: 'supabase'
    };
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', (_request, response) => {
    response.json({
        ok: true,
        supabaseConfigured: Boolean(supabase)
    });
});

app.post('/api/chat-attachments/upload', authenticateRequest, upload.single('file'), async (request, response) => {
    try {
        await assertServerConfigured();

        const validationError = validateIncomingAttachment(request.file);
        if (validationError) {
            response.status(400).json({ error: validationError });
            return;
        }

        const chatId = await assertChatAccess(request.authToken, request.body.chatId);
        const messageId = sanitizePathSegment(request.body.messageId);

        if (!messageId) {
            response.status(400).json({ error: 'Missing message ID.' });
            return;
        }

        const uploadPath = `chat-attachments/${chatId}/${messageId}/${sanitizeFileName(request.file.originalname)}`;
        const contentType = resolveAttachmentContentType(request.file);

        const { error: uploadError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .upload(uploadPath, request.file.buffer, {
                contentType: contentType || undefined,
                upsert: false,
                cacheControl: '3600'
            });

        if (uploadError) {
            console.error('Supabase upload failed:', uploadError);
            response.status(500).json({ error: 'Could not upload the attachment.' });
            return;
        }

        const attachment = formatAttachmentPayload(request.file, uploadPath);
        const { data: signedData, error: signedUrlError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(uploadPath, SUPABASE_SIGNED_URL_TTL_SECONDS);

        if (!signedUrlError && signedData?.signedUrl) {
            attachment.url = signedData.signedUrl;
        }

        response.json({
            attachment,
            expiresIn: SUPABASE_SIGNED_URL_TTL_SECONDS
        });
    } catch (error) {
        console.error('Attachment upload failed:', error);
        response.status(error.status || 500).json({
            error: error.message || 'Could not upload the attachment.'
        });
    }
});

app.post('/api/chat-attachments/sign', authenticateRequest, async (request, response) => {
    try {
        await assertServerConfigured();

        const requestedPaths = Array.isArray(request.body?.paths) ? request.body.paths : [];
        const normalizedPaths = [...new Set(requestedPaths.map(normalizeAttachmentPath).filter(Boolean))];

        if (!normalizedPaths.length) {
            response.json({
                urls: {},
                expiresIn: SUPABASE_SIGNED_URL_TTL_SECONDS
            });
            return;
        }

        if (normalizedPaths.some((filePath) => !extractChatIdFromAttachmentPath(filePath))) {
            response.status(400).json({ error: 'Invalid attachment path.' });
            return;
        }

        const chatIds = [...new Set(normalizedPaths.map(extractChatIdFromAttachmentPath).filter(Boolean))];

        for (const chatId of chatIds) {
            await assertChatAccess(request.authToken, chatId);
        }

        const signedEntries = await Promise.all(normalizedPaths.map(async (filePath) => {
            const chatId = extractChatIdFromAttachmentPath(filePath);

            if (!chatId) {
                return [filePath, ''];
            }

            const { data, error } = await supabase.storage
                .from(SUPABASE_BUCKET)
                .createSignedUrl(filePath, SUPABASE_SIGNED_URL_TTL_SECONDS);

            if (error || !data?.signedUrl) {
                console.error(`Could not sign attachment URL for ${filePath}:`, error);
                return [filePath, ''];
            }

            return [filePath, data.signedUrl];
        }));

        response.json({
            urls: Object.fromEntries(signedEntries.filter(([, signedUrl]) => Boolean(signedUrl))),
            expiresIn: SUPABASE_SIGNED_URL_TTL_SECONDS
        });
    } catch (error) {
        console.error('Signed URL generation failed:', error);
        response.status(error.status || 500).json({
            error: error.message || 'Could not sign attachment URLs.'
        });
    }
});

app.post('/api/chat-attachments/delete', authenticateRequest, async (request, response) => {
    try {
        await assertServerConfigured();

        const filePath = normalizeAttachmentPath(request.body?.path);

        if (!filePath) {
            response.status(400).json({ error: 'Missing attachment path.' });
            return;
        }

        const chatId = extractChatIdFromAttachmentPath(filePath);
        if (!chatId) {
            response.status(400).json({ error: 'Invalid attachment path.' });
            return;
        }

        await assertChatAccess(request.authToken, chatId);

        const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([filePath]);

        if (error) {
            console.error('Attachment cleanup failed:', error);
            response.status(500).json({ error: 'Could not delete the attachment.' });
            return;
        }

        response.json({ ok: true });
    } catch (error) {
        console.error('Attachment deletion failed:', error);
        response.status(error.status || 500).json({
            error: error.message || 'Could not delete the attachment.'
        });
    }
});

app.use(express.static(ROOT_DIR, {
    extensions: ['html']
}));

app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        response.status(400).json({ error: 'File must be 10 MB or smaller.' });
        return;
    }

    console.error('Unhandled server error:', error);
    response.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
    console.log(`Lost & Found server running at http://localhost:${PORT}`);

    if (!supabase) {
        console.warn('SUPABASE_SERVICE_ROLE_KEY is not configured. Chat attachment uploads will fail until it is set.');
    }
});
