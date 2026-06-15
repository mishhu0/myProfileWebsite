import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import { WebSocket, WebSocketServer } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const CHAT_BASE_PATH = normalizeBasePath(process.env.CHAT_BASE_PATH || '/chat')
const CHAT_HOST = String(process.env.CHAT_HOST || '0.0.0.0')
const CHAT_PORT = normalizePort(process.env.CHAT_PORT || '8787', 8787)
const CHAT_HISTORY_LIMIT = clampInteger(process.env.CHAT_HISTORY_LIMIT || '100', 1, 500, 100)
const CHAT_ALLOWED_ORIGIN = String(process.env.CHAT_ALLOWED_ORIGIN || '*').trim() || '*'
const CHAT_DB_PATH = path.resolve(process.env.CHAT_DB_PATH || path.join(projectRoot, '.data', 'chat.sqlite'))

fs.mkdirSync(path.dirname(CHAT_DB_PATH), { recursive: true })

const db = new Database(CHAT_DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        user_tag TEXT NOT NULL,
        name_color TEXT NOT NULL,
        text_color TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_created_at_ms
    ON messages (created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        user_tag TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at_ms
    ON direct_messages (created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS visitors (
        user_tag TEXT PRIMARY KEY,
        visitor_number INTEGER NOT NULL UNIQUE,
        first_seen_at TEXT NOT NULL,
        first_seen_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_visitors_visitor_number
    ON visitors (visitor_number DESC);

    CREATE TABLE IF NOT EXISTS admin_replies (
        id TEXT PRIMARY KEY,
        user_tag TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_admin_replies_user_tag
    ON admin_replies (user_tag, is_read);
`)

const insertMessageStatement = db.prepare(`
    INSERT INTO messages (
        id,
        name,
        user_tag,
        name_color,
        text_color,
        text,
        created_at,
        created_at_ms
    ) VALUES (
        @id,
        @name,
        @user_tag,
        @name_color,
        @text_color,
        @text,
        @created_at,
        @created_at_ms
    )
`)

const insertDirectMessageStatement = db.prepare(`
    INSERT INTO direct_messages (
        id,
        name,
        user_tag,
        text,
        created_at,
        created_at_ms
    ) VALUES (
        @id,
        @name,
        @user_tag,
        @text,
        @created_at,
        @created_at_ms
    )
`)

const selectRecentMessagesStatement = db.prepare(`
    SELECT
        id,
        name,
        user_tag,
        name_color,
        text_color,
        text,
        created_at,
        created_at_ms
    FROM messages
    ORDER BY created_at_ms DESC, rowid DESC
    LIMIT ?
`)

const selectRecentDirectMessagesStatement = db.prepare(`
    SELECT
        id,
        name,
        user_tag,
        text,
        created_at,
        created_at_ms
    FROM direct_messages
    ORDER BY created_at_ms DESC, rowid DESC
    LIMIT ?
`)

const selectMessageCountStatement = db.prepare('SELECT COUNT(*) AS count FROM messages')
const selectDirectMessageCountStatement = db.prepare('SELECT COUNT(*) AS count FROM direct_messages')
const selectVisitorCountStatement = db.prepare('SELECT COUNT(*) AS count FROM visitors')
const selectVisitorByTagStatement = db.prepare(`
    SELECT
        user_tag,
        visitor_number,
        first_seen_at,
        first_seen_at_ms
    FROM visitors
    WHERE user_tag = ?
`)

const insertVisitorStatement = db.prepare(`
    INSERT INTO visitors (
        user_tag,
        visitor_number,
        first_seen_at,
        first_seen_at_ms
    ) VALUES (
        @user_tag,
        @visitor_number,
        @first_seen_at,
        @first_seen_at_ms
    )
`)

const selectRepliesByUserTagStatement = db.prepare(`
    SELECT
        id,
        user_tag,
        text,
        created_at,
        created_at_ms,
        is_read
    FROM admin_replies
    WHERE user_tag = ?
    ORDER BY created_at_ms ASC
`)

const selectUnreadRepliesByUserTagStatement = db.prepare(`
    SELECT
        id,
        user_tag,
        text,
        created_at,
        created_at_ms,
        is_read
    FROM admin_replies
    WHERE user_tag = ? AND is_read = 0
    ORDER BY created_at_ms ASC
`)

const markRepliesReadByUserTagStatement = db.prepare(`
    UPDATE admin_replies SET is_read = 1
    WHERE user_tag = ? AND is_read = 0
`)

const selectDirectMessagesByUserTagStatement = db.prepare(`
    SELECT
        id,
        name,
        user_tag,
        text,
        created_at,
        created_at_ms
    FROM direct_messages
    WHERE user_tag = ?
    ORDER BY created_at_ms ASC
`)

const webSocketServer = new WebSocketServer({ noServer: true })

function normalizeBasePath(value) {
    const trimmed = String(value || '').trim()
    const normalized = '/' + trimmed.replace(/^\/+|\/+$/g, '')
    return normalized === '/' ? '/chat' : normalized
}

function normalizePort(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10)
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
        return parsed
    }

    return fallback
}

function clampInteger(value, minimum, maximum, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10)
    if (!Number.isInteger(parsed)) return fallback
    return Math.min(maximum, Math.max(minimum, parsed))
}

function normalizeHex(value, fallback) {
    const safeFallback = String(fallback || '#000000').toLowerCase()
    const normalized = String(value || '').trim().toLowerCase()
    return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : safeFallback
}

function serializeAdminReply(row) {
    return {
        id: row.id,
        userTag: row.user_tag,
        text: row.text,
        createdAt: row.created_at,
        isRead: Boolean(row.is_read)
    }
}

function getUnreadReplies(userTag) {
    const normalizedTag = normalizeUserTag(userTag)
    if (!normalizedTag || normalizedTag.length < 4) return []

    return selectUnreadRepliesByUserTagStatement.all(normalizedTag).map(serializeAdminReply)
}

function markRepliesRead(userTag) {
    const normalizedTag = normalizeUserTag(userTag)
    if (!normalizedTag || normalizedTag.length < 4) return

    markRepliesReadByUserTagStatement.run(normalizedTag)
}

function getUserDirectMessages(userTag) {
    const normalizedTag = normalizeUserTag(userTag)
    if (!normalizedTag || normalizedTag.length < 4) return []

    return selectDirectMessagesByUserTagStatement.all(normalizedTag).map(serializeDirectMessage)
}

function normalizeName(value) {
    return String(value || '').trim().slice(0, 40)
}

function normalizeUserTag(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function normalizeMessageText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 280)
}

function normalizeDirectMessageText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 600)
}

function serializeMessage(row) {
    return {
        id: row.id,
        name: row.name,
        userTag: row.user_tag,
        nameColor: row.name_color,
        textColor: row.text_color,
        text: row.text,
        createdAt: row.created_at
    }
}

function serializeDirectMessage(row) {
    return {
        id: row.id,
        name: row.name,
        userTag: row.user_tag,
        text: row.text,
        createdAt: row.created_at
    }
}

function serializeVisitor(row) {
    return {
        userTag: row.user_tag,
        visitorNumber: row.visitor_number,
        firstSeenAt: row.first_seen_at
    }
}

function getRecentMessages(limit) {
    const rowLimit = clampInteger(limit, 1, 500, CHAT_HISTORY_LIMIT)
    return selectRecentMessagesStatement.all(rowLimit).map(serializeMessage)
}

function getRecentDirectMessages(limit) {
    const rowLimit = clampInteger(limit, 1, 500, CHAT_HISTORY_LIMIT)
    return selectRecentDirectMessagesStatement.all(rowLimit).map(serializeDirectMessage)
}

function createMessage(payload) {
    const name = normalizeName(payload && payload.name)
    const userTag = normalizeUserTag(payload && payload.userTag)
    const text = normalizeMessageText(payload && payload.text)
    const nameColor = normalizeHex(payload && payload.nameColor, '#0a3333')
    const textColor = normalizeHex(payload && payload.textColor, '#233131')

    if (!name) {
        throw createHttpError(400, 'A chat name is required.')
    }

    if (!userTag || userTag.length < 4) {
        throw createHttpError(400, 'A valid chat user tag is required.')
    }

    if (!text) {
        throw createHttpError(400, 'A message is required.')
    }

    const createdAtMs = Date.now()
    const record = {
        id: 'msg-' + crypto.randomUUID(),
        name,
        user_tag: userTag,
        name_color: nameColor,
        text_color: textColor,
        text,
        created_at: new Date(createdAtMs).toISOString(),
        created_at_ms: createdAtMs
    }

    insertMessageStatement.run(record)
    return serializeMessage(record)
}

function createDirectMessage(payload) {
    const name = normalizeName(payload && payload.name)
    const userTag = normalizeUserTag(payload && payload.userTag)
    const text = normalizeDirectMessageText(payload && payload.text)

    if (!name) {
        throw createHttpError(400, 'A direct-message name is required.')
    }

    if (!userTag || userTag.length < 4) {
        throw createHttpError(400, 'A valid direct-message user tag is required.')
    }

    if (!text) {
        throw createHttpError(400, 'A direct message is required.')
    }

    const createdAtMs = Date.now()
    const record = {
        id: 'dm-' + crypto.randomUUID(),
        name,
        user_tag: userTag,
        text,
        created_at: new Date(createdAtMs).toISOString(),
        created_at_ms: createdAtMs
    }

    insertDirectMessageStatement.run(record)
    return serializeDirectMessage(record)
}

const registerVisitorTransaction = db.transaction(function(userTag) {
    const existing = selectVisitorByTagStatement.get(userTag)
    if (existing) {
        return {
            visitor: serializeVisitor(existing),
            isNew: false,
            totalVisitors: selectVisitorCountStatement.get().count
        }
    }

    const createdAtMs = Date.now()
    const nextVisitorNumber = Number(selectVisitorCountStatement.get().count || 0) + 1
    const record = {
        user_tag: userTag,
        visitor_number: nextVisitorNumber,
        first_seen_at: new Date(createdAtMs).toISOString(),
        first_seen_at_ms: createdAtMs
    }

    insertVisitorStatement.run(record)

    return {
        visitor: serializeVisitor(record),
        isNew: true,
        totalVisitors: nextVisitorNumber
    }
})

function registerVisitor(payload) {
    const userTag = normalizeUserTag(payload && payload.userTag)

    if (!userTag || userTag.length < 4) {
        throw createHttpError(400, 'A valid visitor tag is required.')
    }

    return registerVisitorTransaction(userTag)
}

function createHttpError(statusCode, message) {
    const error = new Error(String(message || 'Request failed.'))
    error.statusCode = statusCode
    return error
}

function readJsonBody(request) {
    return new Promise(function(resolve, reject) {
        let body = ''

        request.on('data', function(chunk) {
            body += chunk
            if (body.length > 8192) {
                reject(createHttpError(413, 'Chat payload is too large.'))
                request.destroy()
            }
        })

        request.on('end', function() {
            if (!body) {
                resolve({})
                return
            }

            try {
                resolve(JSON.parse(body))
            } catch {
                reject(createHttpError(400, 'Invalid JSON body.'))
            }
        })

        request.on('error', reject)
    })
}

function applyCorsHeaders(request, response) {
    const requestOrigin = String(request.headers.origin || '').trim()
    const allowOrigin = CHAT_ALLOWED_ORIGIN === '*' ? '*' : CHAT_ALLOWED_ORIGIN || requestOrigin

    if (allowOrigin) {
        response.setHeader('Access-Control-Allow-Origin', allowOrigin)
    }

    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function writeJson(response, statusCode, payload) {
    response.statusCode = statusCode
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(payload))
}

function broadcast(event) {
    const payload = JSON.stringify(event)
    webSocketServer.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload)
        }
    })
}

function isAllowedWebSocketOrigin(origin) {
    if (CHAT_ALLOWED_ORIGIN === '*') return true
    return String(origin || '').trim() === CHAT_ALLOWED_ORIGIN
}

const server = http.createServer(async function(request, response) {
    applyCorsHeaders(request, response)

    if (request.method === 'OPTIONS') {
        response.statusCode = 204
        response.end()
        return
    }

    try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
        const pathname = requestUrl.pathname.replace(/\/+$/, '') || '/'
        const messagesPath = CHAT_BASE_PATH + '/messages'
        const directMessagesPath = CHAT_BASE_PATH + '/direct-messages'
        const visitorsPath = CHAT_BASE_PATH + '/visitors'
        const healthPath = CHAT_BASE_PATH + '/health'
        const repliesPath = CHAT_BASE_PATH + '/replies'

        if (request.method === 'GET' && pathname === healthPath) {
            writeJson(response, 200, {
                ok: true,
                basePath: CHAT_BASE_PATH,
                messageCount: selectMessageCountStatement.get().count,
                directMessageCount: selectDirectMessageCountStatement.get().count,
                visitorCount: selectVisitorCountStatement.get().count
            })
            return
        }

        if (request.method === 'GET' && pathname === messagesPath) {
            const limit = requestUrl.searchParams.get('limit') || String(CHAT_HISTORY_LIMIT)
            writeJson(response, 200, {
                messages: getRecentMessages(limit)
            })
            return
        }

        if (request.method === 'POST' && pathname === messagesPath) {
            const payload = await readJsonBody(request)
            const message = createMessage(payload)

            broadcast({
                type: 'message.created',
                message
            })

            writeJson(response, 201, { message })
            return
        }

        if (request.method === 'POST' && pathname === directMessagesPath) {
            const payload = await readJsonBody(request)
            const directMessage = createDirectMessage(payload)

            writeJson(response, 201, { directMessage })
            return
        }

        if (request.method === 'POST' && pathname === visitorsPath) {
            const payload = await readJsonBody(request)
            const result = registerVisitor(payload)

            if (result.isNew) {
                broadcast({
                    type: 'visitor.registered',
                    visitor: result.visitor,
                    totalVisitors: result.totalVisitors
                })
            }

            writeJson(response, result.isNew ? 201 : 200, result)
            return
        }

        if (request.method === 'GET' && pathname === directMessagesPath) {
            const userTag = requestUrl.searchParams.get('userTag') || ''
            const messages = getUserDirectMessages(userTag)

            writeJson(response, 200, { messages })
            return
        }

        if (request.method === 'GET' && pathname === repliesPath) {
            const userTag = requestUrl.searchParams.get('userTag') || ''

            if (!userTag || normalizeUserTag(userTag).length < 4) {
                throw createHttpError(400, 'A valid userTag query parameter is required.')
            }

            const replies = getUnreadReplies(userTag)
            markRepliesRead(userTag)

            writeJson(response, 200, {
                replies,
                unreadCount: replies.length
            })
            return
        }

        throw createHttpError(404, 'Chat route not found.')
    } catch (error) {
        const statusCode = Number.isInteger(error && error.statusCode) ? error.statusCode : 500
        if (statusCode >= 500) {
            console.error('Chat server request failed:', error)
        }
        writeJson(response, statusCode, {
            error: statusCode >= 500 ? 'Internal server error.' : String(error.message || 'Request failed.')
        })
    }
})

server.on('upgrade', function(request, socket, head) {
    try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
        const pathname = requestUrl.pathname.replace(/\/+$/, '') || '/'

        if (pathname !== CHAT_BASE_PATH + '/ws') {
            socket.destroy()
            return
        }

        if (!isAllowedWebSocketOrigin(request.headers.origin)) {
            socket.destroy()
            return
        }

        webSocketServer.handleUpgrade(request, socket, head, function(client) {
            webSocketServer.emit('connection', client, request)
        })
    } catch {
        socket.destroy()
    }
})

webSocketServer.on('connection', function(client) {
    client.send(JSON.stringify({
        type: 'chat.ready',
        historyLimit: CHAT_HISTORY_LIMIT
    }))
})

server.listen(CHAT_PORT, CHAT_HOST, function() {
    console.log('Chat server listening on http://' + CHAT_HOST + ':' + CHAT_PORT + CHAT_BASE_PATH)
    console.log('Chat database:', CHAT_DB_PATH)
})