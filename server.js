require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://stogzhtvnvobmhvoqxuy.supabase.co';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'Chat-proofs';
const SUPABASE_ITEM_BUCKET = process.env.SUPABASE_ITEM_BUCKET || 'item-images';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_SIGNED_URL_TTL_SECONDS = Math.max(
    60,
    Math.min(24 * 60 * 60, Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS || 3600))
);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'lost-and-found-16023';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDWt4CTYOxfgx3K72c4pfeFm7q6rzLC1Zg';
const CLOUDFLARE_TURNSTILE_SITE_KEY = process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '';
const CLOUDFLARE_TURNSTILE_SECRET_KEY = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '';
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ITEM_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_PUBLIC_ITEM_LIMIT = 50;
const MAX_PUBLIC_ITEM_LIMIT = 100;
const GOOGLE_SECURETOKEN_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOUDFLARE_TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ITEM_IMAGE_PATH_PREFIX = 'item-images';

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

const attachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES
    }
});

const itemImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_ITEM_IMAGE_SIZE_BYTES
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

function getAuthenticatedUserId(request) {
    return sanitizePathSegment(request.authUser?.user_id || request.authUser?.sub || '');
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

function validateIncomingItemImage(file) {
    if (!file) {
        return 'Please choose an image first.';
    }

    if (file.size > MAX_ITEM_IMAGE_SIZE_BYTES) {
        return 'Image must be 5 MB or smaller.';
    }

    const extension = getFileExtension(file.originalname);
    const mimeType = String(file.mimetype || '').toLowerCase();
    const isAcceptedByMime = mimeType.startsWith('image/');
    const isAcceptedByExtension = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension);

    if (!isAcceptedByMime && !isAcceptedByExtension) {
        return 'Please select a valid image file.';
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

function getClientIp(request) {
    const cfConnectingIp = String(request.headers['cf-connecting-ip'] || '').trim();
    if (cfConnectingIp) {
        return cfConnectingIp;
    }

    const forwardedFor = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwardedFor || request.socket?.remoteAddress || '';
}

async function verifyTurnstileToken(token, remoteIp) {
    if (!CLOUDFLARE_TURNSTILE_SECRET_KEY) {
        const configError = new Error('Human verification is not configured.');
        configError.status = 503;
        throw configError;
    }

    const formData = new URLSearchParams({
        secret: CLOUDFLARE_TURNSTILE_SECRET_KEY,
        response: token
    });

    if (remoteIp) {
        formData.set('remoteip', remoteIp);
    }

    const turnstileResponse = await fetch(CLOUDFLARE_TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body: formData
    });

    let payload = null;

    try {
        payload = await turnstileResponse.json();
    } catch (error) {
        const parseError = new Error('Could not parse human verification response.');
        parseError.status = 502;
        throw parseError;
    }

    if (!turnstileResponse.ok) {
        const upstreamError = new Error('Could not validate human verification.');
        upstreamError.status = 502;
        upstreamError.details = payload;
        throw upstreamError;
    }

    return payload;
}

async function assertServerConfigured() {
    if (!supabase) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
    }
}

function parsePositiveInt(value, fallback, maxValue) {
    const parsedValue = Number.parseInt(String(value || ''), 10);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return fallback;
    }

    return Math.min(parsedValue, maxValue);
}

function getEffectivePublicItemQueryLimit(limit, category, search) {
    if ((category && category !== 'all') || search) {
        return MAX_PUBLIC_ITEM_LIMIT;
    }

    return limit;
}

function getFirestoreValueData(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number.parseInt(value.integerValue, 10);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;

    if ('mapValue' in value) {
        const fields = value.mapValue?.fields || {};
        return Object.fromEntries(
            Object.entries(fields).map(([fieldName, fieldValue]) => [fieldName, getFirestoreValueData(fieldValue)])
        );
    }

    if ('arrayValue' in value) {
        const values = value.arrayValue?.values || [];
        return values.map(getFirestoreValueData);
    }

    return null;
}

function decodeFirestoreDocument(document) {
    const fieldEntries = Object.entries(document?.fields || {});
    const decodedFields = Object.fromEntries(
        fieldEntries.map(([fieldName, fieldValue]) => [fieldName, getFirestoreValueData(fieldValue)])
    );

    return {
        id: String(document?.name || '').split('/').pop() || '',
        ...decodedFields
    };
}

function getPublicItemCreatedAtMillis(item) {
    if (!item?.createdAt) {
        return null;
    }

    const parsedTime = Date.parse(String(item.createdAt));
    return Number.isNaN(parsedTime) ? null : parsedTime;
}

function sortPublicItemsByCreatedAtDesc(leftItem, rightItem) {
    const leftMillis = getPublicItemCreatedAtMillis(leftItem);
    const rightMillis = getPublicItemCreatedAtMillis(rightItem);

    if (leftMillis === null && rightMillis === null) {
        return String(rightItem?.id || '').localeCompare(String(leftItem?.id || ''));
    }

    if (leftMillis === null) {
        return 1;
    }

    if (rightMillis === null) {
        return -1;
    }

    if (leftMillis === rightMillis) {
        return String(rightItem?.id || '').localeCompare(String(leftItem?.id || ''));
    }

    return rightMillis - leftMillis;
}

function buildPublicItemsStructuredQuery(type, itemLimit) {
    const filters = [
        {
            fieldFilter: {
                field: {
                    fieldPath: 'status'
                },
                op: 'EQUAL',
                value: {
                    stringValue: 'active'
                }
            }
        },
        {
            fieldFilter: {
                field: {
                    fieldPath: 'reviewStatus'
                },
                op: 'EQUAL',
                value: {
                    stringValue: 'approved'
                }
            }
        }
    ];

    if (type === 'lost' || type === 'found') {
        filters.unshift({
            fieldFilter: {
                field: {
                    fieldPath: 'type'
                },
                op: 'EQUAL',
                value: {
                    stringValue: type
                }
            }
        });
    }

    return {
        from: [
            {
                collectionId: 'items'
            }
        ],
        where: {
            compositeFilter: {
                op: 'AND',
                filters
            }
        },
        orderBy: [
            {
                field: {
                    fieldPath: 'createdAt'
                },
                direction: 'DESCENDING'
            },
            {
                field: {
                    fieldPath: '__name__'
                },
                direction: 'DESCENDING'
            }
        ],
        limit: itemLimit
    };
}

async function runFirestorePublicItemsQuery(type, itemLimit) {
    if (!FIREBASE_WEB_API_KEY) {
        throw new Error('FIREBASE_WEB_API_KEY is not configured on the server.');
    }

    const firestoreResponse = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                structuredQuery: buildPublicItemsStructuredQuery(type, itemLimit)
            })
        }
    );

    const responseText = await firestoreResponse.text();

    if (!firestoreResponse.ok) {
        throw new Error(`Firestore public items query failed: ${responseText}`);
    }

    let queryRows = [];

    try {
        queryRows = JSON.parse(responseText);
    } catch (error) {
        throw new Error(`Could not parse Firestore public items response: ${responseText}`);
    }

    return queryRows
        .map((row) => row?.document ? decodeFirestoreDocument(row.document) : null)
        .filter(Boolean);
}

function filterPublicItems(items, { category, search }) {
    let filteredItems = [...items];

    if (category && category !== 'all') {
        filteredItems = filteredItems.filter((item) => item.category === category);
    }

    if (search) {
        const normalizedSearch = search.toLowerCase();
        filteredItems = filteredItems.filter((item) => {
            const searchableFields = [
                item.title,
                item.description,
                item.location
            ];

            return searchableFields.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
        });
    }

    return filteredItems;
}

async function getPublicItems({ type, limit, category, search }) {
    const queryLimit = getEffectivePublicItemQueryLimit(limit, category, search);
    let items = [];

    if (type === 'all') {
        const [lostItems, foundItems] = await Promise.all([
            runFirestorePublicItemsQuery('lost', queryLimit),
            runFirestorePublicItemsQuery('found', queryLimit)
        ]);

        items = [...lostItems, ...foundItems];
    } else {
        items = await runFirestorePublicItemsQuery(type, queryLimit);
    }

    return filterPublicItems(items, { category, search })
        .sort(sortPublicItemsByCreatedAtDesc)
        .slice(0, limit);
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

function extractItemImageOwnerFromPath(filePath) {
    const parts = normalizeAttachmentPath(filePath).split('/');

    if (parts.length < 3 || parts[0] !== ITEM_IMAGE_PATH_PREFIX) {
        return '';
    }

    return sanitizePathSegment(parts[1]);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', (_request, response) => {
    response.json({
        ok: true,
        supabaseConfigured: Boolean(supabase)
    });
});

app.get('/api/turnstile/config', (_request, response) => {
    const configured = Boolean(CLOUDFLARE_TURNSTILE_SITE_KEY && CLOUDFLARE_TURNSTILE_SECRET_KEY);
    response.json({
        siteKey: CLOUDFLARE_TURNSTILE_SITE_KEY,
        configured,
        error: configured ? '' : 'Human verification needs Cloudflare Turnstile keys on the server.'
    });
});

app.post('/api/turnstile/verify', async (request, response) => {
    const token = String(request.body?.token || '').trim();

    if (!CLOUDFLARE_TURNSTILE_SITE_KEY || !CLOUDFLARE_TURNSTILE_SECRET_KEY) {
        response.status(503).json({
            error: 'Human verification is not configured.'
        });
        return;
    }

    if (!token) {
        response.status(400).json({
            error: 'Please verify that you are human.'
        });
        return;
    }

    try {
        const payload = await verifyTurnstileToken(token, getClientIp(request));

        if (!payload?.success) {
            console.warn('Cloudflare Turnstile validation failed:', payload?.['error-codes'] || []);
            response.status(403).json({
                error: 'Human verification failed. Please try again.'
            });
            return;
        }

        response.json({ ok: true });
    } catch (error) {
        console.error('Cloudflare Turnstile validation error:', error.details || error);
        response.status(error.status || 500).json({
            error: error.status === 503
                ? 'Human verification is not configured.'
                : 'Could not validate human verification. Please try again.'
        });
    }
});

app.get('/api/items', async (request, response) => {
    const requestedType = String(request.query.type || 'all').toLowerCase();
    const type = ['all', 'lost', 'found'].includes(requestedType) ? requestedType : 'all';
    const limit = parsePositiveInt(request.query.limit, DEFAULT_PUBLIC_ITEM_LIMIT, MAX_PUBLIC_ITEM_LIMIT);
    const category = String(request.query.category || 'all').trim() || 'all';
    const search = String(request.query.search || '').trim();

    try {
        const items = await getPublicItems({
            type,
            limit,
            category,
            search
        });

        response.json({
            items
        });
    } catch (error) {
        console.error('Public items fetch failed:', error);
        response.status(500).json({
            error: 'Could not load items.'
        });
    }
});

app.post('/api/item-images/upload', authenticateRequest, itemImageUpload.single('file'), async (request, response) => {
    try {
        await assertServerConfigured();

        const validationError = validateIncomingItemImage(request.file);
        if (validationError) {
            response.status(400).json({ error: validationError });
            return;
        }

        const userId = getAuthenticatedUserId(request);

        if (!userId) {
            response.status(401).json({ error: 'Could not resolve your account.' });
            return;
        }

        const uploadPath = `${ITEM_IMAGE_PATH_PREFIX}/${userId}/${Date.now()}-${sanitizeFileName(request.file.originalname || 'item-image')}`;
        const contentType = resolveAttachmentContentType(request.file);

        const { error: uploadError } = await supabase.storage
            .from(SUPABASE_ITEM_BUCKET)
            .upload(uploadPath, request.file.buffer, {
                contentType: contentType || undefined,
                upsert: false,
                cacheControl: '3600'
            });

        if (uploadError) {
            console.error('Supabase item image upload failed:', uploadError);
            response.status(500).json({ error: 'Could not upload the item image.' });
            return;
        }

        const { data: publicUrlData } = supabase.storage
            .from(SUPABASE_ITEM_BUCKET)
            .getPublicUrl(uploadPath);

        if (!publicUrlData?.publicUrl) {
            await supabase.storage.from(SUPABASE_ITEM_BUCKET).remove([uploadPath]);
            response.status(500).json({ error: 'Could not resolve the uploaded image URL.' });
            return;
        }

        response.json({
            imageUrl: publicUrlData.publicUrl,
            path: uploadPath,
            provider: 'supabase'
        });
    } catch (error) {
        console.error('Item image upload failed:', error);
        response.status(error.status || 500).json({
            error: error.message || 'Could not upload the item image.'
        });
    }
});

app.post('/api/item-images/delete', authenticateRequest, async (request, response) => {
    try {
        await assertServerConfigured();

        const filePath = normalizeAttachmentPath(request.body?.path);

        if (!filePath) {
            response.status(400).json({ error: 'Missing item image path.' });
            return;
        }

        const userId = getAuthenticatedUserId(request);
        const pathOwner = extractItemImageOwnerFromPath(filePath);

        if (!userId || !pathOwner || pathOwner !== userId) {
            response.status(403).json({ error: 'You do not have access to this item image.' });
            return;
        }

        const { error } = await supabase.storage.from(SUPABASE_ITEM_BUCKET).remove([filePath]);

        if (error) {
            console.error('Item image cleanup failed:', error);
            response.status(500).json({ error: 'Could not delete the uploaded item image.' });
            return;
        }

        response.json({ ok: true });
    } catch (error) {
        console.error('Item image deletion failed:', error);
        response.status(error.status || 500).json({
            error: error.message || 'Could not delete the uploaded item image.'
        });
    }
});

app.post('/api/chat-attachments/upload', authenticateRequest, attachmentUpload.single('file'), async (request, response) => {
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
        const message = _request.path === '/api/item-images/upload'
            ? 'Image must be 5 MB or smaller.'
            : 'File must be 10 MB or smaller.';
        response.status(400).json({ error: message });
        return;
    }

    console.error('Unhandled server error:', error);
    response.status(500).json({ error: 'Unexpected server error.' });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Lost & Found server running at http://localhost:${PORT}`);

        if (!supabase) {
            console.warn('SUPABASE_SERVICE_ROLE_KEY is not configured. Chat attachment uploads will fail until it is set.');
        }
    });
}

module.exports = app;
