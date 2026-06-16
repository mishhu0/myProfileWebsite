function initChatTab() {
    const CHAT_USER_TAG_KEY = 'chatUserTag'
    const DEFAULT_MESSAGE_COLORS = {
        nameColor: '#0a3333',
        textColor: '#233131'
    }
    const RECONNECT_DELAY_MS = 2000
    const chatConfig = (window.APP_CONFIG && window.APP_CONFIG.chat) || {}
    const chatEnabled = chatConfig.enabled !== false
    const chatDebug = Boolean(chatConfig.debug)
    const disabledMessage = String(chatConfig.disabledMessage || 'Chat is disabled right now.')
    const chatApiBase = String(chatConfig.apiBase || (window.location.protocol === 'file:' ? 'http://127.0.0.1:8787/chat' : '/chat')).replace(/\/+$/, '')
    const chatWsUrl = resolveWebSocketUrl(chatConfig.wsUrl, chatApiBase)
    const chatHistoryLimit = normalizeHistoryLimit(chatConfig.historyLimit)
    const chatRoot = document.getElementById('chatTab')
    const messagesRoot = document.getElementById('chatMessages')
    const form = document.getElementById('chatForm')
    const messageInput = document.getElementById('chatMessageInput')
    const sendButton = document.getElementById('chatSendBtn')
    const status = document.getElementById('chatStatus')
    const editNameButton = document.getElementById('chatEditNameBtn')
    const nameColorInput = document.getElementById('chatNameColorInput')
    const textColorInput = document.getElementById('chatTextColorInput')
    const emojiMenuWrap = document.getElementById('chatEmojiMenuWrap')
    const emojiToggleButton = document.getElementById('chatEmojiToggleBtn')
    const emojiMenu = document.getElementById('chatEmojiMenu')

    if (!chatRoot || !messagesRoot || !form || !messageInput || !sendButton || !status || !editNameButton || !nameColorInput || !textColorInput || !emojiMenuWrap || !emojiToggleButton || !emojiMenu) return

    const emojiButtons = Array.from(emojiMenu.querySelectorAll('[data-emoji]'))
    let messages = []
    let loadState = 'loading'
    let activeSocket = null
    let reconnectTimer = 0
    let statusResetTimer = 0
    let isSending = false

    function normalizeHistoryLimit(value) {
        const parsed = Number.parseInt(String(value || ''), 10)
        if (!Number.isInteger(parsed)) return 100
        return Math.min(200, Math.max(10, parsed))
    }

    function joinUrl(base, suffix) {
        return String(base || '').replace(/\/+$/, '') + '/' + String(suffix || '').replace(/^\/+/, '')
    }

    function resolveWebSocketUrl(configuredUrl, apiBase) {
        const explicitUrl = String(configuredUrl || '').trim()
        if (explicitUrl) return explicitUrl

        if (window.location.protocol === 'file:') {
            return 'ws://127.0.0.1:8787/chat/ws'
        }

        const httpUrl = /^https?:\/\//i.test(apiBase)
            ? new URL(joinUrl(apiBase, 'ws'))
            : new URL(joinUrl(apiBase, 'ws'), window.location.origin)

        httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:'
        return httpUrl.toString()
    }

    function getProfileName() {
        if (typeof window.getStoredProfileName === 'function') {
            return String(window.getStoredProfileName() || '').trim()
        }

        return String(localStorage.getItem('profileName') || '').trim()
    }

    function createUserTag() {
        if (typeof window.getPersistentUserTag === 'function') {
            return window.getPersistentUserTag()
        }

        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID().slice(0, 6).toLowerCase()
        }

        return Math.random().toString(36).slice(2, 8).toLowerCase()
    }

    function getChatUserTag() {
        if (typeof window.getPersistentUserTag === 'function') {
            return window.getPersistentUserTag()
        }

        let storedTag = String(localStorage.getItem(CHAT_USER_TAG_KEY) || '').trim().toLowerCase()
        if (!/^[a-z0-9]{4,8}$/.test(storedTag)) {
            storedTag = createUserTag()
            localStorage.setItem(CHAT_USER_TAG_KEY, storedTag)
        }

        return storedTag
    }

    function normalizeHex(value, fallback) {
        const safeFallback = String(fallback || '#000000').toLowerCase()
        const normalized = String(value || '').trim().toLowerCase()
        return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : safeFallback
    }

    function getCurrentMessageColors() {
        return {
            nameColor: normalizeHex(nameColorInput.value, DEFAULT_MESSAGE_COLORS.nameColor),
            textColor: normalizeHex(textColorInput.value, DEFAULT_MESSAGE_COLORS.textColor)
        }
    }

    function applyComposerColors() {
        const currentColors = getCurrentMessageColors()
        chatRoot.style.setProperty('--chat-compose-name-color', currentColors.nameColor)
        chatRoot.style.setProperty('--chat-compose-text-color', currentColors.textColor)
    }

    function appendIdentityParts(target, name, userTag, prefixText, nameColor) {
        if (!target) return

        const safeName = String(name || '').trim()
        const safeTag = String(userTag || '').trim().toLowerCase()
        target.innerHTML = ''

        if (prefixText) {
            const prefix = document.createElement('span')
            prefix.className = 'chat-identity-prefix'
            prefix.textContent = String(prefixText)
            target.appendChild(prefix)
        }

        if (!safeName) {
            const fallback = document.createElement('span')
            fallback.className = 'chat-identity-name'
            fallback.textContent = 'name required'
            target.appendChild(fallback)
            return
        }

        const namePart = document.createElement('span')
        namePart.className = 'chat-identity-name'
        namePart.textContent = safeName
        if (nameColor) {
            namePart.style.color = normalizeHex(nameColor, DEFAULT_MESSAGE_COLORS.nameColor)
        }
        target.appendChild(namePart)

        if (!safeTag) return

        const tagPart = document.createElement('span')
        tagPart.className = 'chat-identity-tag'
        tagPart.textContent = '#' + safeTag
        target.appendChild(tagPart)
    }

    function formatMessageTime(value) {
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return ''

        return parsed.toLocaleString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    function getMessageSortValue(entry) {
        const parsed = Date.parse(entry && entry.createdAt)
        return Number.isFinite(parsed) ? parsed : 0
    }

    function normalizeMessageEntry(entry) {
        if (!entry || !entry.name || !entry.text) return null

        const id = String(entry.id || '').trim()
        if (!id) return null

        return {
            id,
            name: String(entry.name || '').trim().slice(0, 40),
            userTag: String(entry.userTag || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8),
            nameColor: normalizeHex(entry.nameColor, DEFAULT_MESSAGE_COLORS.nameColor),
            textColor: normalizeHex(entry.textColor, DEFAULT_MESSAGE_COLORS.textColor),
            text: String(entry.text || '').trim().slice(0, 280),
            createdAt: String(entry.createdAt || new Date().toISOString())
        }
    }

    function replaceMessages(entries) {
        messages = (Array.isArray(entries) ? entries : [])
            .map(normalizeMessageEntry)
            .filter(Boolean)
            .sort(function(left, right) {
                return getMessageSortValue(right) - getMessageSortValue(left)
            })
            .slice(0, chatHistoryLimit)

        loadState = 'ready'
        renderMessages()
    }

    function mergeMessages(entries) {
        const nextMessagesById = new Map()

        messages.forEach(function(entry) {
            nextMessagesById.set(entry.id, entry)
        })

        ;(Array.isArray(entries) ? entries : []).forEach(function(entry) {
            const normalizedEntry = normalizeMessageEntry(entry)
            if (normalizedEntry) {
                nextMessagesById.set(normalizedEntry.id, normalizedEntry)
            }
        })

        messages = Array.from(nextMessagesById.values())
            .sort(function(left, right) {
                return getMessageSortValue(right) - getMessageSortValue(left)
            })
            .slice(0, chatHistoryLimit)

        loadState = 'ready'
        renderMessages()
    }

    function scrollToLatest() {
        messagesRoot.scrollTop = 0
    }

    function setStatus(message) {
        status.textContent = String(message || 'name required')
    }

    function showTemporaryStatus(message) {
        window.clearTimeout(statusResetTimer)
        setStatus(message)
        statusResetTimer = window.setTimeout(function() {
            if (!chatEnabled) {
                setStatus(disabledMessage)
                return
            }

            syncIdentity()
        }, 2500)
    }

    function setFormBusy(isBusy) {
        isSending = Boolean(isBusy)
        sendButton.disabled = isSending
    }

    function syncIdentity() {
        const profileName = getProfileName()
        chatRoot.classList.toggle('is-name-missing', !profileName)

        if (!profileName) {
            setStatus('name required')
        } else {
            appendIdentityParts(status, profileName, getChatUserTag(), 'posting as ', getCurrentMessageColors().nameColor)
        }
    }

    function renderMessages() {
        messagesRoot.innerHTML = ''

        if (loadState === 'disabled') {
            const disabledState = document.createElement('p')
            disabledState.className = 'chat-empty'
            disabledState.textContent = disabledMessage
            messagesRoot.appendChild(disabledState)
            return
        }

        if (!messages.length && loadState === 'loading') {
            const loading = document.createElement('p')
            loading.className = 'chat-loading'
            loading.textContent = 'Loading chat...'
            messagesRoot.appendChild(loading)
            return
        }

        if (!messages.length && loadState === 'error') {
            const errorState = document.createElement('p')
            errorState.className = 'chat-empty'
            errorState.textContent = 'Chat server is offline right now.'
            messagesRoot.appendChild(errorState)
            return
        }

        if (!messages.length) {
            const empty = document.createElement('p')
            empty.className = 'chat-empty'
            empty.textContent = 'No messages yet. Will you be the first one?'
            messagesRoot.appendChild(empty)
            return
        }

        messages.forEach(function(entry) {
            const item = document.createElement('article')
            item.className = 'chat-message'

            const header = document.createElement('div')
            header.className = 'chat-message-header'

            const author = document.createElement('span')
            author.className = 'chat-message-author'
            appendIdentityParts(author, entry.name, entry.userTag, '', entry.nameColor)

            const time = document.createElement('span')
            time.className = 'chat-message-time'
            time.textContent = formatMessageTime(entry.createdAt)

            const body = document.createElement('p')
            body.className = 'chat-message-body'
            body.textContent = String(entry.text)
            body.style.color = normalizeHex(entry.textColor, DEFAULT_MESSAGE_COLORS.textColor)

            header.appendChild(author)
            header.appendChild(time)
            item.appendChild(header)
            item.appendChild(body)
            messagesRoot.appendChild(item)
        })

        scrollToLatest()
    }

    async function fetchMessages() {
        if (!chatEnabled) return

        try {
            const response = await fetch(joinUrl(chatApiBase, 'messages') + '?limit=' + encodeURIComponent(String(chatHistoryLimit)), {
                headers: {
                    Accept: 'application/json'
                }
            })

            if (!response.ok) {
                throw new Error('Chat history request failed with ' + response.status)
            }

            const payload = await response.json()
            replaceMessages(payload && payload.messages)
        } catch (error) {
            if (!messages.length) {
                loadState = 'error'
                renderMessages()
            }
            if (chatDebug) {
                console.warn('Could not load chat messages:', error)
            }
        }
    }

    async function postMessage(messagePayload) {
        if (!chatEnabled) {
            throw new Error(disabledMessage)
        }

        const response = await fetch(joinUrl(chatApiBase, 'messages'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(messagePayload)
        })

        const payload = await response.json().catch(function() {
            return {}
        })

        if (!response.ok) {
            throw new Error(payload && payload.error ? payload.error : 'Chat message could not be sent.')
        }

        return payload && payload.message ? payload.message : null
    }

    function scheduleReconnect() {
        if (reconnectTimer) return

        reconnectTimer = window.setTimeout(function() {
            reconnectTimer = 0
            connectSocket()
        }, RECONNECT_DELAY_MS)
    }

    function connectSocket() {
        if (!chatEnabled || !chatWsUrl) return

        try {
            const socket = new WebSocket(chatWsUrl)
            activeSocket = socket

            socket.addEventListener('open', function() {
                fetchMessages()
                var tag = getChatUserTag()
                if (tag) {
                    socket.send(JSON.stringify({ type: 'user.identify', userTag: tag }))
                }
            })

            socket.addEventListener('message', function(event) {
                try {
                    const rawPayload = typeof event.data === 'string' ? event.data.trim() : ''
                    if (!rawPayload || (rawPayload.charAt(0) !== '{' && rawPayload.charAt(0) !== '[')) {
                        return
                    }

                    const payload = JSON.parse(rawPayload)
                    if (payload && payload.type === 'message.created') {
                        mergeMessages([payload.message])
                    }
                } catch (error) {
                    if (chatDebug) {
                        console.warn('Could not parse chat socket payload:', error)
                    }
                }
            })

            socket.addEventListener('close', function() {
                if (activeSocket === socket) {
                    activeSocket = null
                }
                scheduleReconnect()
            })

            socket.addEventListener('error', function() {
                socket.close()
            })
        } catch (error) {
            if (chatDebug) {
                console.warn('Could not connect to chat socket:', error)
            }
            scheduleReconnect()
        }
    }

    function openOptionsForName() {
        if (typeof window.openOptionsPanel === 'function') {
            window.openOptionsPanel()
        }
    }

    function nudgeEntityToOptions() {
        const optionsPanel = document.getElementById('optionsPanel')
        if (!optionsPanel) return

        if (window.entity3d && typeof window.entity3d.moveNextToElement === 'function') {
            window.entity3d.moveNextToElement(optionsPanel, {
                gap: 10,
                margin: 16
            }).then(function(didMove) {
                if (!didMove) return

                if (window.entityChat && typeof window.entityChat.show === 'function') {
                    window.entityChat.show({
                        id: 'chat-name-required',
                        placement: 'right-up',
                        gap: 2,
                        offsetX: -40,
                        offsetY: 30,
                        messages: [
                            {
                                author: '꩜',
                                text: 'You need a name in order to chat.'
                            }
                        ]
                    })
                }
            })
            return
        }

        if (window.entityChat && typeof window.entityChat.show === 'function') {
            window.entityChat.show({
                id: 'chat-name-required',
                placement: 'top-right',
                gap: 2,
                offsetX: -40,
                offsetY: 30,
                messages: [
                    {
                        author: '꩜',
                        text: 'You need a name in order to chat.'
                    }
                ]
            })
        }
    }

    function ensureChatIdentity() {
        const profileName = getProfileName()
        if (profileName) return profileName

        syncIdentity()
        openOptionsForName()
        requestAnimationFrame(nudgeEntityToOptions)
        return ''
    }

    function setEmojiMenuOpen(isOpen) {
        emojiMenuWrap.classList.toggle('is-open', isOpen)
        emojiMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true')
        emojiToggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    }

    function insertEmoji(emojiValue) {
        const rawValue = messageInput.value || ''
        const emojiText = String(emojiValue || '')
        if (!emojiText) return

        const start = typeof messageInput.selectionStart === 'number' ? messageInput.selectionStart : rawValue.length
        const end = typeof messageInput.selectionEnd === 'number' ? messageInput.selectionEnd : rawValue.length
        const nextValue = rawValue.slice(0, start) + emojiText + rawValue.slice(end)
        messageInput.value = nextValue

        const nextCursor = start + emojiText.length
        messageInput.focus()
        messageInput.setSelectionRange(nextCursor, nextCursor)
    }

    window.windowOpenGuards = window.windowOpenGuards || {}
    window.windowOpenGuards.chatTab = function() {
        if (!chatEnabled) {
            return true
        }

        const profileName = ensureChatIdentity()
        syncIdentity()
        return Boolean(profileName)
    }

    editNameButton.addEventListener('click', function() {
        openOptionsForName()
    })

    nameColorInput.addEventListener('input', function() {
        applyComposerColors()
        syncIdentity()
    })

    textColorInput.addEventListener('input', function() {
        applyComposerColors()
    })

    emojiToggleButton.addEventListener('click', function() {
        setEmojiMenuOpen(!emojiMenuWrap.classList.contains('is-open'))
    })

    emojiButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            insertEmoji(button.dataset.emoji)
        })
    })

    messageInput.addEventListener('focus', function() {
        if (getProfileName()) return
        messageInput.blur()
        ensureChatIdentity()
    })

    form.addEventListener('submit', async function(event) {
        event.preventDefault()

        if (!chatEnabled) {
            showTemporaryStatus(disabledMessage)
            return
        }

        if (isSending) return

        const profileName = ensureChatIdentity()
        if (!profileName) return

        const message = String(messageInput.value || '').trim()
        if (!message) {
            appendIdentityParts(status, profileName, getChatUserTag(), 'posting as ', getCurrentMessageColors().nameColor)
            return
        }

        setFormBusy(true)

        try {
            const createdMessage = await postMessage({
                name: profileName,
                userTag: getChatUserTag(),
                nameColor: getCurrentMessageColors().nameColor,
                textColor: getCurrentMessageColors().textColor,
                text: message
            })

            if (createdMessage) {
                mergeMessages([createdMessage])
            }

            messageInput.value = ''
            syncIdentity()
            messageInput.focus()
        } catch (error) {
            if (chatDebug) {
                console.warn('Could not send chat message:', error)
            }
            showTemporaryStatus('chat server unavailable')
        } finally {
            setFormBusy(false)
        }
    })

    window.addEventListener('profile-name-updated', function() {
        syncIdentity()
    })

    window.addEventListener('beforeunload', function() {
        window.clearTimeout(reconnectTimer)
        window.clearTimeout(statusResetTimer)
        if (activeSocket) {
            activeSocket.close()
            activeSocket = null
        }
    })

    nameColorInput.value = DEFAULT_MESSAGE_COLORS.nameColor
    textColorInput.value = DEFAULT_MESSAGE_COLORS.textColor
    applyComposerColors()

    if (!chatEnabled) {
        loadState = 'disabled'
        messageInput.disabled = true
        sendButton.disabled = true
        emojiToggleButton.disabled = true
        messageInput.placeholder = 'chat disabled in local dev'
        renderMessages()
        setStatus(disabledMessage)
        return
    }

    renderMessages()
    syncIdentity()
    fetchMessages()
    connectSocket()
}

window.initChatTab = initChatTab