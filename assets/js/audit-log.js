import { auth, db } from './firebase-config.js';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let cachedActor = null;

function getFallbackActorName(user) {
    if (!user) return 'Unknown User';

    if (user.displayName?.trim()) {
        return user.displayName.trim();
    }

    if (user.email) {
        return user.email.split('@')[0];
    }

    return 'Unknown User';
}

async function resolveActorName(user) {
    if (!user) {
        return 'Unknown User';
    }

    if (cachedActor && cachedActor.uid === user.uid) {
        return cachedActor.name;
    }

    let actorName = getFallbackActorName(user);

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            actorName = userDoc.data().name || actorName;
        }
    } catch (error) {
        console.error('Audit actor name lookup failed:', error);
    }

    cachedActor = {
        uid: user.uid,
        name: actorName
    };

    return actorName;
}

export async function writeAuditLog({
    type,
    message,
    targetId = '',
    targetType = '',
    meta = null
}) {
    const user = auth.currentUser;
    if (!user) {
        return;
    }

    try {
        const actorName = await resolveActorName(user);
        const payload = {
            type,
            message,
            actorUid: user.uid,
            actorName,
            targetId,
            targetType,
            createdAt: serverTimestamp()
        };

        if (meta && typeof meta === 'object' && Object.keys(meta).length) {
            payload.meta = meta;
        }

        await addDoc(collection(db, 'auditLogs'), payload);
    } catch (error) {
        console.error('Audit log write failed:', error);
    }
}
