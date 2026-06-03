function initChatTab() {
    const STORAGE_KEY = (window.APP_CONFIG && window.APP_CONFIG.storageKeys && window.APP_CONFIG.storageKeys.chatMessages) || 'chatMessages'
    const CHAT_USER_TAG_KEY = 'chatUserTag'
    const DEFAULT_MESSAGE_COLORS = {
        nameColor: '#0a3333',
        textColor: '#233131'
    }
    const chatRoot = document.getElementById('chatTab')
    const messagesRoot = document.getElementById('chatMessages')
    const form = document.getElementById('chatForm')
    const messageInput = document.getElementById('chatMessageInput')
    const status = document.getElementById('chatStatus')
    const editNameButton = document.getElementById('chatEditNameBtn')
    const nameColorInput = document.getElementById('chatNameColorInput')
    const textColorInput = document.getElementById('chatTextColorInput')
    const emojiMenuWrap = document.getElementById('chatEmojiMenuWrap')
    const emojiToggleButton = document.getElementById('chatEmojiToggleBtn')
    const emojiMenu = document.getElementById('chatEmojiMenu')

    if (!chatRoot || !messagesRoot || !form || !messageInput || !status || !editNameButton || !nameColorInput || !textColorInput || !emojiMenuWrap || !emojiToggleButton || !emojiMenu) return

    const emojiButtons = Array.from(emojiMenu.querySelectorAll('[data-emoji]'))

    function getProfileName() {
        if (typeof window.getStoredProfileName === 'function') {
            return String(window.getStoredProfileName() || '').trim()
        }

        return String(localStorage.getItem('profileName') || '').trim()
    }

    function createUserTag() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID().slice(0, 6).toUpperCase()
        }

        return Math.random().toString(36).slice(2, 8).toUpperCase()
    }

    function getChatUserTag() {
        let storedTag = String(localStorage.getItem(CHAT_USER_TAG_KEY) || '').trim().toUpperCase()
        if (!/^[A-Z0-9]{4,8}$/.test(storedTag)) {
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

    function formatIdentity(name, userTag) {
        const safeName = String(name || '').trim()
        const safeTag = String(userTag || '').trim().toUpperCase()
        if (!safeName) return 'name required'
        return safeTag ? safeName + ' #' + safeTag : safeName
    }

    function appendIdentityParts(target, name, userTag, prefixText, nameColor) {
        if (!target) return

        const safeName = String(name || '').trim()
        const safeTag = String(userTag || '').trim().toUpperCase()
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

    function loadMessages() {
        try {
            const rawValue = localStorage.getItem(STORAGE_KEY)
            const parsed = rawValue ? JSON.parse(rawValue) : []
            return Array.isArray(parsed) ? parsed.filter(function(entry) {
                return entry && entry.name && entry.text
            }) : []
        } catch (error) {
            console.warn('Could not parse chat storage:', error)
            return []
        }
    }

    function saveMessages(messages) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    }

    function scrollToLatest() {
        messagesRoot.scrollTop = messagesRoot.scrollHeight
    }

    function setStatus(message) {
        status.textContent = String(message || 'name required')
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
        const messages = loadMessages()
        messagesRoot.innerHTML = ''

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

    function appendMessage(name, text) {
        const userTag = getChatUserTag()
        const currentColors = getCurrentMessageColors()
        const messages = loadMessages()
        messages.push({
            id: 'msg-' + Date.now() + '-' + Math.round(Math.random() * 100000),
            name: String(name),
            userTag: userTag,
            nameColor: currentColors.nameColor,
            textColor: currentColors.textColor,
            text: String(text),
            createdAt: new Date().toISOString()
        })
        saveMessages(messages)
        renderMessages()
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

    form.addEventListener('submit', function(event) {
        event.preventDefault()

        const profileName = ensureChatIdentity()
        if (!profileName) return

        const message = String(messageInput.value || '').trim()
        if (!message) {
            appendIdentityParts(status, profileName, getChatUserTag(), 'posting as ', getCurrentMessageColors().nameColor)
            return
        }

        appendMessage(profileName, message)
        messageInput.value = ''
        syncIdentity()
        messageInput.focus()
    })

    window.addEventListener('storage', function(event) {
        if (event.key === STORAGE_KEY || event.key === 'profileName') {
            renderMessages()
            syncIdentity()
        }
    })

    window.addEventListener('profile-name-updated', function() {
        syncIdentity()
    })

    nameColorInput.value = DEFAULT_MESSAGE_COLORS.nameColor
    textColorInput.value = DEFAULT_MESSAGE_COLORS.textColor
    applyComposerColors()
    renderMessages()
    syncIdentity()
}

window.initChatTab = initChatTab