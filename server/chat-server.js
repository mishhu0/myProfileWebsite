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
        first_seen_at_ms INTEGER NOT NULL,
        last_seen_at TEXT NOT NULL DEFAULT '',
        last_seen_at_ms INTEGER NOT NULL DEFAULT 0,
        last_ip TEXT NOT NULL DEFAULT '',
        country_code TEXT NOT NULL DEFAULT '',
        browser_name TEXT NOT NULL DEFAULT '',
        os_name TEXT NOT NULL DEFAULT '',
        device_type TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT ''
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

    CREATE TABLE IF NOT EXISTS online_users (
        user_tag TEXT PRIMARY KEY,
        last_seen_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visitor_activity (
        user_tag TEXT NOT NULL,
        day TEXT NOT NULL,
        seconds INTEGER NOT NULL DEFAULT 0,
        first_seen_ms INTEGER NOT NULL,
        last_seen_ms INTEGER NOT NULL,
        PRIMARY KEY (user_tag, day)
    );

    CREATE INDEX IF NOT EXISTS idx_visitor_activity_user
    ON visitor_activity (user_tag, day);
`)

db.exec(`DELETE FROM online_users`)

function ensureTableColumn(tableName, columnName, definition) {
    const columnRows = db.prepare('PRAGMA table_info(' + tableName + ')').all()
    const existingColumns = new Set(columnRows.map(function(column) {
        return column.name
    }))

    if (existingColumns.has(columnName)) {
        return
    }

    db.exec('ALTER TABLE ' + tableName + ' ADD COLUMN ' + columnName + ' ' + definition)
}

ensureTableColumn('visitors', 'last_seen_at', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'last_seen_at_ms', 'INTEGER NOT NULL DEFAULT 0')
ensureTableColumn('visitors', 'last_ip', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'country_code', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'browser_name', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'os_name', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'device_type', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'language', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'user_agent', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'timezone', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'chat_name_color', "TEXT NOT NULL DEFAULT ''")
ensureTableColumn('visitors', 'chat_text_color', "TEXT NOT NULL DEFAULT ''")

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
    ORDER BY created_at_ms ASC, rowid ASC
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
        first_seen_at_ms,
        last_seen_at,
        last_seen_at_ms,
        last_ip,
        country_code,
        browser_name,
        os_name,
        device_type,
        language,
        user_agent,
        timezone
    FROM visitors
    WHERE user_tag = ?
`)

const insertVisitorStatement = db.prepare(`
    INSERT INTO visitors (
        user_tag,
        visitor_number,
        first_seen_at,
        first_seen_at_ms,
        last_seen_at,
        last_seen_at_ms,
        last_ip,
        country_code,
        browser_name,
        os_name,
        device_type,
        language,
        user_agent
    ) VALUES (
        @user_tag,
        @visitor_number,
        @first_seen_at,
        @first_seen_at_ms,
        @last_seen_at,
        @last_seen_at_ms,
        @last_ip,
        @country_code,
        @browser_name,
        @os_name,
        @device_type,
        @language,
        @user_agent
    )
`)

const updateVisitorMetadataStatement = db.prepare(`
    UPDATE visitors SET
        last_seen_at = @last_seen_at,
        last_seen_at_ms = @last_seen_at_ms,
        last_ip = @last_ip,
        country_code = @country_code,
        browser_name = @browser_name,
        os_name = @os_name,
        device_type = @device_type,
        language = @language,
        user_agent = @user_agent
    WHERE user_tag = @user_tag
`)

const selectMaxVisitorNumberStatement = db.prepare(`
    SELECT COALESCE(MAX(visitor_number), 0) AS max_number FROM visitors
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

const countUnreadRepliesByUserTagStatement = db.prepare(`
    SELECT COUNT(*) AS count
    FROM admin_replies
    WHERE user_tag = ? AND is_read = 0
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

const upsertOnlineUserStatement = db.prepare(`
    INSERT OR REPLACE INTO online_users (user_tag, last_seen_at_ms)
    VALUES (@user_tag, @last_seen_at_ms)
`)

const deleteOnlineUserStatement = db.prepare(`
    DELETE FROM online_users WHERE user_tag = ?
`)

const selectAllOnlineUsersStatement = db.prepare(`
    SELECT user_tag FROM online_users
`)

const upsertVisitorActivityStatement = db.prepare(`
    INSERT INTO visitor_activity (user_tag, day, seconds, first_seen_ms, last_seen_ms)
    VALUES (@user_tag, @day, @seconds, @first_seen_ms, @last_seen_ms)
    ON CONFLICT(user_tag, day) DO UPDATE SET
        seconds = seconds + excluded.seconds,
        last_seen_ms = MAX(last_seen_ms, excluded.last_seen_ms)
`)

const updateVisitorPresenceStatement = db.prepare(`
    UPDATE visitors SET
        timezone = CASE WHEN @timezone <> '' THEN @timezone ELSE timezone END,
        chat_name_color = CASE WHEN @chat_name_color <> '' THEN @chat_name_color ELSE chat_name_color END,
        chat_text_color = CASE WHEN @chat_text_color <> '' THEN @chat_text_color ELSE chat_text_color END
    WHERE user_tag = @user_tag
`)

const onlineCounts = new Map()

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

function normalizeMetadataText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength || 255)
}

function normalizeCountryCode(value) {
    const normalized = String(value || '').trim().toUpperCase()
    return /^[A-Z]{2}$/.test(normalized) ? normalized : ''
}

function inferCountryCodeFromLanguage(languageTag) {
    const normalizedTag = normalizeMetadataText(languageTag, 32)
    if (!normalizedTag) {
        return ''
    }

    const parts = normalizedTag.replace(/_/g, '-').split('-').filter(Boolean)
    const explicitRegion = parts.find(function(part) {
        return /^[A-Za-z]{2}$/.test(part) && part.length === 2 && part.toLowerCase() !== parts[0].toLowerCase()
    })

    if (explicitRegion) {
        return normalizeCountryCode(explicitRegion)
    }

    const primaryLanguage = String(parts[0] || '').toLowerCase()
    const languageFallbackMap = {
        bg: 'BG',
        cs: 'CZ',
        da: 'DK',
        el: 'GR',
        et: 'EE',
        fi: 'FI',
        hr: 'HR',
        hu: 'HU',
        ja: 'JP',
        ko: 'KR',
        lt: 'LT',
        lv: 'LV',
        nb: 'NO',
        nn: 'NO',
        pl: 'PL',
        pt: 'PT',
        ro: 'RO',
        sk: 'SK',
        sl: 'SI',
        sq: 'AL',
        sr: 'RS',
        sv: 'SE',
        tr: 'TR',
        uk: 'UA'
    }

    return languageFallbackMap[primaryLanguage] || ''
}

function parseUserAgentMetadata(userAgentValue) {
    const userAgent = normalizeMetadataText(userAgentValue, 600)
    const source = userAgent.toLowerCase()
    let browserName = ''
    let osName = ''
    let deviceType = ''

    if (/bot|crawler|spider|slurp/.test(source)) {
        deviceType = 'Bot'
    } else if (/ipad|tablet/.test(source)) {
        deviceType = 'Tablet'
    } else if (/mobi|iphone|android/.test(source)) {
        deviceType = 'Phone'
    } else if (userAgent) {
        deviceType = 'PC'
    }

    if (/edg\//.test(source)) {
        browserName = 'Edge'
    } else if (/opr\//.test(source) || /opera/.test(source)) {
        browserName = 'Opera'
    } else if (/samsungbrowser\//.test(source)) {
        browserName = 'Samsung Internet'
    } else if (/chrome\//.test(source) && !/edg\//.test(source) && !/opr\//.test(source)) {
        browserName = 'Chrome'
    } else if (/firefox\//.test(source)) {
        browserName = 'Firefox'
    } else if (/safari\//.test(source) && !/chrome\//.test(source)) {
        browserName = 'Safari'
    } else if (/trident|msie/.test(source)) {
        browserName = 'Internet Explorer'
    }

    if (/windows nt/.test(source)) {
        osName = 'Windows'
    } else if (/iphone|ipad|ipod/.test(source)) {
        osName = 'iOS'
    } else if (/android/.test(source)) {
        osName = 'Android'
    } else if (/cros/.test(source)) {
        osName = 'ChromeOS'
    } else if (/mac os x|macintosh/.test(source)) {
        osName = 'macOS'
    } else if (/linux/.test(source)) {
        osName = 'Linux'
    }

    return {
        userAgent,
        browserName,
        osName,
        deviceType
    }
}

function normalizeIpAddress(value) {
    let address = normalizeMetadataText(value, 120)
    if (!address) {
        return ''
    }

    address = address.replace(/^\[/, '').replace(/\]$/, '')

    const mappedMatch = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
    if (mappedMatch) {
        address = mappedMatch[1]
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(address)) {
        address = address.split(':')[0]
    }

    return address
}

function isPrivateIpAddress(value) {
    const address = normalizeIpAddress(value)
    if (!address) return true
    if (address === '::1' || address === 'localhost') return true
    if (/^127\./.test(address)) return true
    if (/^10\./.test(address)) return true
    if (/^192\.168\./.test(address)) return true
    if (/^169\.254\./.test(address)) return true
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) return true
    if (/^f[cd][0-9a-f]{2}:/i.test(address)) return true
    if (/^fe80:/i.test(address)) return true
    return false
}

function getClientIp(request) {
    const forwarded = normalizeMetadataText(request && request.headers ? request.headers['x-forwarded-for'] : '', 255)
    if (forwarded) {
        const chain = forwarded.split(',')
        for (let index = 0; index < chain.length; index += 1) {
            const candidate = normalizeIpAddress(chain[index])
            if (candidate && !isPrivateIpAddress(candidate)) {
                return candidate
            }
        }
    }

    const realIp = normalizeMetadataText(request && request.headers ? request.headers['x-real-ip'] : '', 120)
    if (realIp && !isPrivateIpAddress(realIp)) {
        return normalizeIpAddress(realIp)
    }

    const socketIp = normalizeMetadataText(request && request.socket ? request.socket.remoteAddress : '', 120)
    if (socketIp && !isPrivateIpAddress(socketIp)) {
        return normalizeIpAddress(socketIp)
    }

    return ''
}

function getCountryCode(request) {
    if (!request || !request.headers) {
        return ''
    }

    const preferredLanguage = getPreferredLanguage(request)

    return normalizeCountryCode(
        request.headers['cf-ipcountry'] ||
        request.headers['x-vercel-ip-country'] ||
        request.headers['cloudfront-viewer-country'] ||
        request.headers['x-country-code']
    ) || inferCountryCodeFromLanguage(preferredLanguage)
}

function getPreferredLanguage(request) {
    const headerValue = normalizeMetadataText(request && request.headers ? request.headers['accept-language'] : '', 120)
    return normalizeMetadataText(headerValue.split(',')[0], 32)
}

function getVisitorMetadataFromRequest(request) {
    const parsedAgent = parseUserAgentMetadata(request && request.headers ? request.headers['user-agent'] : '')

    return {
        last_ip: getClientIp(request),
        country_code: getCountryCode(request),
        browser_name: parsedAgent.browserName,
        os_name: parsedAgent.osName,
        device_type: parsedAgent.deviceType,
        language: getPreferredLanguage(request),
        user_agent: parsedAgent.userAgent
    }
}

function serializeAdminReply(row) {
    return {
        id: row.id,
        userTag: row.user_tag,
        text: row.text,
        createdAt: row.created_at,
        createdAtMs: row.created_at_ms,
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

const MAX_NAME_LENGTH = 20

function normalizeName(value) {
    return String(value || '').trim().slice(0, MAX_NAME_LENGTH)
}

function normalizeUserTag(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function normalizeMessageText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 600)
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
        createdAt: row.created_at,
        createdAtMs: row.created_at_ms
    }
}

function serializeVisitor(row) {
    return {
        userTag: row.user_tag,
        visitorNumber: row.visitor_number,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at || row.first_seen_at,
        lastIp: row.last_ip || '',
        countryCode: row.country_code || '',
        browser: row.browser_name || '',
        operatingSystem: row.os_name || '',
        deviceType: row.device_type || '',
        language: row.language || '',
        userAgent: row.user_agent || '',
        timezone: row.timezone || ''
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

const registerVisitorTransaction = db.transaction(function(userTag, metadata, allowCreate) {
    const existing = selectVisitorByTagStatement.get(userTag)
    const createdAtMs = Date.now()
    const lastSeenAt = new Date(createdAtMs).toISOString()
    const safeMetadata = metadata || {}

    if (existing) {
        const updatedRecord = {
            user_tag: existing.user_tag,
            last_seen_at: lastSeenAt,
            last_seen_at_ms: createdAtMs,
            last_ip: safeMetadata.last_ip || existing.last_ip || '',
            country_code: safeMetadata.country_code || existing.country_code || '',
            browser_name: safeMetadata.browser_name || existing.browser_name || '',
            os_name: safeMetadata.os_name || existing.os_name || '',
            device_type: safeMetadata.device_type || existing.device_type || '',
            language: safeMetadata.language || existing.language || '',
            user_agent: safeMetadata.user_agent || existing.user_agent || ''
        }

        updateVisitorMetadataStatement.run(updatedRecord)

        return {
            visitor: serializeVisitor({
                ...existing,
                ...updatedRecord
            }),
            isNew: false,
            totalVisitors: selectVisitorCountStatement.get().count
        }
    }

    if (allowCreate === false) {
        return null
    }

    const nextVisitorNumber = Number(selectMaxVisitorNumberStatement.get().max_number || 0) + 1
    const record = {
        user_tag: userTag,
        visitor_number: nextVisitorNumber,
        first_seen_at: lastSeenAt,
        first_seen_at_ms: createdAtMs,
        last_seen_at: lastSeenAt,
        last_seen_at_ms: createdAtMs,
        last_ip: safeMetadata.last_ip || '',
        country_code: safeMetadata.country_code || '',
        browser_name: safeMetadata.browser_name || '',
        os_name: safeMetadata.os_name || '',
        device_type: safeMetadata.device_type || '',
        language: safeMetadata.language || '',
        user_agent: safeMetadata.user_agent || ''
    }

    insertVisitorStatement.run(record)

    return {
        visitor: serializeVisitor(record),
        isNew: true,
        totalVisitors: nextVisitorNumber
    }
})

function registerVisitor(payload, request) {
    const userTag = normalizeUserTag(payload && payload.userTag)

    if (!userTag || userTag.length < 4) {
        throw createHttpError(400, 'A valid visitor tag is required.')
    }

    return registerVisitorTransaction(userTag, getVisitorMetadataFromRequest(request), true)
}

function touchVisitorMetadata(userTag, metadata, allowCreate) {
    const normalizedUserTag = normalizeUserTag(userTag)
    if (!normalizedUserTag || normalizedUserTag.length < 4) {
        return null
    }

    return registerVisitorTransaction(normalizedUserTag, metadata, allowCreate !== false)
}

function getActivityDayKey(ms, timezone) {
    const safeTimezone = normalizeTimezone(timezone)

    if (safeTimezone) {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: safeTimezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date(ms))
        } catch (error) {
            // fall through to UTC
        }
    }

    return new Date(ms).toISOString().slice(0, 10)
}

function normalizeOptionalHex(value) {
    const normalized = String(value || '').trim().toLowerCase()
    return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : ''
}

function normalizeTimezone(value) {
    return normalizeMetadataText(value, 64)
}

function normalizeActiveSeconds(value) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0
    }

    return Math.min(120, Math.floor(parsed))
}

function recordActivity(userTag, presence, seconds) {
    const normalizedTag = normalizeUserTag(userTag)
    if (!normalizedTag || normalizedTag.length < 4) {
        return
    }

    const safePresence = presence && typeof presence === 'object' ? presence : {}
    const safeSeconds = normalizeActiveSeconds(seconds)
    const safeTimezone = normalizeTimezone(safePresence.timezone)
    const safeNameColor = normalizeOptionalHex(safePresence.nameColor)
    const safeTextColor = normalizeOptionalHex(safePresence.textColor)
    const now = Date.now()

    if (safeSeconds > 0) {
        upsertVisitorActivityStatement.run({
            user_tag: normalizedTag,
            day: getActivityDayKey(now, safeTimezone),
            seconds: safeSeconds,
            first_seen_ms: now,
            last_seen_ms: now
        })
    }

    if (safeTimezone || safeNameColor || safeTextColor) {
        updateVisitorPresenceStatement.run({
            user_tag: normalizedTag,
            timezone: safeTimezone,
            chat_name_color: safeNameColor,
            chat_text_color: safeTextColor
        })
    }
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
            touchVisitorMetadata(payload && payload.userTag, getVisitorMetadataFromRequest(request), true)

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
            touchVisitorMetadata(payload && payload.userTag, getVisitorMetadataFromRequest(request), true)

            writeJson(response, 201, { directMessage })
            return
        }

        if (request.method === 'POST' && pathname === visitorsPath) {
            const payload = await readJsonBody(request)
            const result = registerVisitor(payload, request)

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

            const normalizedTag = normalizeUserTag(userTag)
            const replies = selectRepliesByUserTagStatement.all(normalizedTag).map(serializeAdminReply)
            const unreadRow = countUnreadRepliesByUserTagStatement.get(normalizedTag)
            const unreadCount = unreadRow ? Number(unreadRow.count) : 0
            markRepliesRead(userTag)

            writeJson(response, 200, {
                replies,
                unreadCount
            })
            return
        }

        const replyUnreadCountPath = CHAT_BASE_PATH + '/replies/unread-count'

        if (request.method === 'GET' && pathname === replyUnreadCountPath) {
            const userTag = requestUrl.searchParams.get('userTag') || ''

            if (!userTag || normalizeUserTag(userTag).length < 4) {
                throw createHttpError(400, 'A valid userTag query parameter is required.')
            }

            const normalizedTag = normalizeUserTag(userTag)
            const row = countUnreadRepliesByUserTagStatement.get(normalizedTag)
            var unreadCount = row ? Number(row.count) : 0

            writeJson(response, 200, { unreadCount })
            return
        }

        const repliesNotifyPath = CHAT_BASE_PATH + '/replies/notify'

        if (request.method === 'POST' && pathname === repliesNotifyPath) {
            const payload = await readJsonBody(request)
            const notifyUserTag = normalizeUserTag(payload && payload.userTag)

            if (!notifyUserTag || notifyUserTag.length < 4) {
                throw createHttpError(400, 'A valid userTag is required.')
            }

            const rawReply = payload && payload.reply ? payload.reply : null
            if (!rawReply || !rawReply.id || !rawReply.text) {
                throw createHttpError(400, 'A reply object with id and text is required.')
            }

            var notifiedCount = 0
            var serializedReply = serializeAdminReply(rawReply)

            webSocketServer.clients.forEach(function(client) {
                if (client.readyState === WebSocket.OPEN && client.userTag === notifyUserTag) {
                    client.send(JSON.stringify({ type: 'reply.created', reply: serializedReply }))
                    notifiedCount += 1
                }
            })

            writeJson(response, 200, { ok: true, notified: notifiedCount })
            return
        }

        const conversationsNotifyDeletedPath = CHAT_BASE_PATH + '/conversations/notify-deleted'

        if (request.method === 'POST' && pathname === conversationsNotifyDeletedPath) {
            const payload = await readJsonBody(request)
            const notifyUserTag = normalizeUserTag(payload && payload.userTag)

            if (!notifyUserTag || notifyUserTag.length < 4) {
                throw createHttpError(400, 'A valid userTag is required.')
            }

            webSocketServer.clients.forEach(function(client) {
                if (client.readyState === WebSocket.OPEN && client.userTag === notifyUserTag) {
                    client.send(JSON.stringify({ type: 'conversation.deleted' }))
                }
            })

            writeJson(response, 200, { ok: true })
            return
        }

        const onlineUsersPath = CHAT_BASE_PATH + '/online-users'

        if (request.method === 'GET' && pathname === onlineUsersPath) {
            const rows = selectAllOnlineUsersStatement.all()
            const onlineUsers = rows.map(function(row) { return row.user_tag })
            writeJson(response, 200, { onlineUsers })
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

webSocketServer.on('connection', function(client, request) {
    client.requestMetadata = getVisitorMetadataFromRequest(request)

    client.send(JSON.stringify({
        type: 'chat.ready',
        historyLimit: CHAT_HISTORY_LIMIT
    }))

    client.on('message', function(data) {
        try {
            const message = JSON.parse(data.toString())
            if (message && message.type === 'user.identify') {
                const userTag = normalizeUserTag(message.userTag)
                if (userTag && userTag.length >= 4) {
                    const prevCount = onlineCounts.get(userTag) || 0
                    onlineCounts.set(userTag, prevCount + 1)
                    client.userTag = userTag

                    upsertOnlineUserStatement.run({
                        user_tag: userTag,
                        last_seen_at_ms: Date.now()
                    })

                    touchVisitorMetadata(userTag, client.requestMetadata, false)
                    recordActivity(userTag, { timezone: message.timezone, nameColor: message.nameColor, textColor: message.textColor }, 0)

                    if (prevCount === 0) {
                        broadcast({ type: 'user.online', userTag })
                    }
                }
            } else if (message && message.type === 'user.heartbeat') {
                const heartbeatTag = normalizeUserTag(message.userTag)
                if (heartbeatTag && heartbeatTag.length >= 4) {
                    client.userTag = client.userTag || heartbeatTag
                    recordActivity(heartbeatTag, { timezone: message.timezone, nameColor: message.nameColor, textColor: message.textColor }, message.seconds)
                }
            }
        } catch {
            // Ignore invalid JSON messages
        }
    })

    client.on('close', function() {
        const userTag = client.userTag
        if (userTag) {
            const count = (onlineCounts.get(userTag) || 1) - 1
            if (count <= 0) {
                onlineCounts.delete(userTag)
                deleteOnlineUserStatement.run(userTag)
                broadcast({ type: 'user.offline', userTag })
            } else {
                onlineCounts.set(userTag, count)
            }
        }
    })
})

server.listen(CHAT_PORT, CHAT_HOST, function() {
    console.log('Chat server listening on http://' + CHAT_HOST + ':' + CHAT_PORT + CHAT_BASE_PATH)
    console.log('Chat database:', CHAT_DB_PATH)
})