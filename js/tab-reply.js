function initReplyTab() {
    const replyTab = document.getElementById('replyTab')
    const replyMessages = document.getElementById('replyMessages')
    const replyForm = document.getElementById('replyForm')
    const replyInput = document.getElementById('replyMessageInput')
    const replySendBtn = document.getElementById('replySendBtn')
    const emojiWrap = document.getElementById('replyEmojiWrap')
    const emojiToggle = document.getElementById('replyEmojiToggle')
    const emojiMenu = document.getElementById('replyEmojiMenu')

    if (!replyTab || !replyMessages || !replyForm || !replyInput || !replySendBtn) return

    const baseServerConfig = (window.APP_CONFIG && window.APP_CONFIG.chat) || {}
    const replyConfig = (window.APP_CONFIG && window.APP_CONFIG.reply) || {}
    const apiBase = String(
        replyConfig.apiBase
            || baseServerConfig.apiBase
            || (window.location.protocol === 'file:' ? 'http://127.0.0.1:8787/chat' : '/chat')
    ).replace(/\/+$/, '')
    const chatEnabled = baseServerConfig.enabled !== false

    let userTag = ''
    let profileName = ''
    let isLoading = false
    let conversation = []
    let replyPollTimer = 0
    let replySocket = null
    const REPLY_RECONNECT_MS = 5000
    const POLL_INTERVAL_MS = 30000

    function getUserTag() {
        if (typeof window.getPersistentUserTag === 'function') {
            return String(window.getPersistentUserTag() || '').trim().toLowerCase()
        }
        return String(Math.random().toString(36).slice(2, 8) || '').trim().toLowerCase()
    }

    function getProfileName() {
        if (typeof window.getStoredProfileName === 'function') {
            return String(window.getStoredProfileName() || '').trim()
        }
        return String(localStorage.getItem('profileName') || '').trim()
    }

    function joinUrl(base, suffix) {
        return String(base || '').replace(/\/+$/, '') + '/' + String(suffix || '').replace(/^\/+/, '')
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options)
        const payload = await response.json().catch(function() { return {} })
        if (!response.ok) {
            throw new Error(payload && payload.error ? payload.error : 'Request failed.')
        }
        return payload
    }

    function setEmojiMenuOpen(isOpen) {
        if (!emojiWrap || !emojiToggle || !emojiMenu) return
        emojiWrap.classList.toggle('is-open', isOpen)
        emojiMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true')
        emojiToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    }

    function insertEmoji(emojiValue) {
        if (!replyInput) return
        var rawValue = replyInput.value || ''
        var emojiText = String(emojiValue || '')
        if (!emojiText) return

        var start = typeof replyInput.selectionStart === 'number' ? replyInput.selectionStart : rawValue.length
        var end = typeof replyInput.selectionEnd === 'number' ? replyInput.selectionEnd : rawValue.length
        var nextValue = rawValue.slice(0, start) + emojiText + rawValue.slice(end)
        replyInput.value = nextValue

        var nextCursor = start + emojiText.length
        replyInput.focus()
        replyInput.setSelectionRange(nextCursor, nextCursor)
    }

    if (emojiToggle && emojiWrap) {
        emojiToggle.addEventListener('click', function() {
            setEmojiMenuOpen(!emojiWrap.classList.contains('is-open'))
        })
    }

    function bindReplyEmojiButtons() {
        if (!emojiMenu) return
        var btns = Array.from(emojiMenu.querySelectorAll('[data-emoji]'))
        btns.forEach(function(button) {
            button.addEventListener('click', function() {
                insertEmoji(button.dataset.emoji)
            })
        })
    }

    bindReplyEmojiButtons()

    if (emojiMenu) {
        var emojiGrid = emojiMenu.querySelector('.reply-emoji-grid')
        if (emojiGrid) {
            fetch('misc/emojis.json')
                .then(function(r) { return r.json() })
                .then(function(emojis) {
                    emojiGrid.innerHTML = ''
                    emojis.forEach(function(e) {
                        var btn = document.createElement('button')
                        btn.type = 'button'
                        btn.className = 'reply-emoji-option'
                        btn.setAttribute('data-emoji', e.emoji)
                        btn.setAttribute('aria-label', e.label)
                        if (e.small) btn.style.fontSize = '9px'
                        btn.textContent = e.label === 'Star' ? '\u2605' : e.emoji
                        emojiGrid.appendChild(btn)
                    })
                    bindReplyEmojiButtons()
                })
                .catch(function() {})
        }
    }

    function showLoading() {
        replyMessages.innerHTML = '<p class="reply-loading">loading conversation...</p>'
    }

    function showEmpty() {
        replyMessages.innerHTML = '<p class="reply-empty">no messages yet</p>'
    }

    function showError(msg) {
        replyMessages.innerHTML = '<p class="reply-error">' + (msg || 'could not load conversation') + '</p>'
    }

    function formatTime(isoString) {
        if (!isoString) return ''
        try {
            const date = new Date(isoString)
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } catch {
            return ''
        }
    }

    function createMessageElement(item) {
        const el = document.createElement('div')
        el.className = 'reply-message' + (item.isReply ? ' reply-message--admin' : ' reply-message--user')

        const meta = document.createElement('div')
        meta.className = 'reply-message__meta'

        const nameEl = document.createElement('span')
        nameEl.className = 'reply-message__meta-name'
        nameEl.textContent = item.isReply ? 'Mihai' : (profileName || 'You')

        const timeEl = document.createElement('span')
        timeEl.className = 'reply-message__meta-time'
        timeEl.textContent = formatTime(item.createdAt)

        meta.appendChild(nameEl)
        meta.appendChild(timeEl)

        const text = document.createElement('p')
        text.className = 'reply-message__text'
        text.textContent = item.text

        el.appendChild(meta)
        el.appendChild(text)

        return el
    }

    function renderConversation() {
        replyMessages.innerHTML = ''

        if (!conversation.length) {
            showEmpty()
            return
        }

        const fragment = document.createDocumentFragment()
        for (var i = 0; i < conversation.length; i++) {
            fragment.appendChild(createMessageElement(conversation[i]))
        }
        var spacer = document.createElement('div')
        spacer.className = 'reply-messages-spacer'
        spacer.innerHTML = '&nbsp;'
        fragment.appendChild(spacer)
        replyMessages.appendChild(fragment)
        replyMessages.scrollTop = replyMessages.scrollHeight
    }

    async function fetchConversation() {
        if (isLoading) return
        isLoading = true
        showLoading()

        try {
            const [repliesData, dmsData] = await Promise.all([
                requestJson(joinUrl(apiBase, 'replies') + '?userTag=' + encodeURIComponent(userTag)).catch(function() {
                    return { replies: [], unreadCount: 0 }
                }),
                requestJson(joinUrl(apiBase, 'direct-messages') + '?userTag=' + encodeURIComponent(userTag)).catch(function() {
                    return { messages: [] }
                })
            ])

            const replies = Array.isArray(repliesData.replies) ? repliesData.replies : []
            const dms = Array.isArray(dmsData.messages) ? dmsData.messages : []

            var merged = []
            for (var i = 0; i < dms.length; i++) {
                merged.push({
                    id: dms[i].id,
                    text: dms[i].text,
                    createdAt: dms[i].createdAt,
                    created_at_ms: Number(dms[i].createdAtMs || 0),
                    isReply: false
                })
            }
            for (var j = 0; j < replies.length; j++) {
                merged.push({
                    id: replies[j].id,
                    text: replies[j].text,
                    createdAt: replies[j].createdAt,
                    created_at_ms: Number(replies[j].createdAtMs || 0),
                    isReply: true
                })
            }

            merged.sort(function(a, b) {
                return a.created_at_ms - b.created_at_ms
            })

            conversation = merged

            profileName = getProfileName()

            renderConversation()

            if (repliesData.unreadCount > 0 || conversation.length > 0) {
                var tabsTaskbar = window.tabsTaskbar
                if (tabsTaskbar && typeof tabsTaskbar.showTaskbarButton === 'function') {
                    tabsTaskbar.showTaskbarButton('replyTab')
                }
            }
        } catch (error) {
            showError('cannot connect to chat server')
        }

        isLoading = false
    }

    async function checkUnreadReplies() {
        try {
            var data = await requestJson(joinUrl(apiBase, 'replies/unread-count') + '?userTag=' + encodeURIComponent(userTag))
            if (data && data.unreadCount > 0) {
                var tabsTaskbar = window.tabsTaskbar
                if (tabsTaskbar && typeof tabsTaskbar.openWindow === 'function') {
                    tabsTaskbar.openWindow('replyTab')
                }
                fetchConversation()
            }
        } catch {
            // Server might be offline, silently ignore
        }
    }

    function startReplyPolling() {
        stopReplyPolling()
        replyPollTimer = window.setInterval(checkUnreadReplies, POLL_INTERVAL_MS)
    }

    function stopReplyPolling() {
        if (replyPollTimer) {
            window.clearInterval(replyPollTimer)
            replyPollTimer = 0
        }
    }

    function getReplyWsUrl() {
        var chatWsConfig = window.APP_CONFIG && window.APP_CONFIG.chat && window.APP_CONFIG.chat.wsUrl
        var explicitWs = String(chatWsConfig || '').trim()
        if (explicitWs) return explicitWs
        if (window.location.protocol === 'file:') return 'ws://127.0.0.1:8787/chat/ws'
        var wsUrl = joinUrl(apiBase, 'ws')
        var parsed = /^https?:\/\//i.test(apiBase)
            ? new URL(wsUrl)
            : new URL(wsUrl, window.location.origin)
        parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
        return parsed.toString()
    }

    function connectReplySocket() {
        var wsUrl = getReplyWsUrl()
        if (!wsUrl) return

        try {
            var socket = new WebSocket(wsUrl)
            replySocket = socket

            socket.addEventListener('open', function() {
                if (userTag) {
                    socket.send(JSON.stringify({ type: 'user.identify', userTag: userTag }))
                }
            })

            socket.addEventListener('message', function(event) {
                try {
                    var rawPayload = typeof event.data === 'string' ? event.data.trim() : ''
                    if (!rawPayload || (rawPayload.charAt(0) !== '{' && rawPayload.charAt(0) !== '[')) return

                    var payload = JSON.parse(rawPayload)
                    if (payload && payload.type === 'reply.created') {
                        var tabsTaskbar = window.tabsTaskbar
                        if (tabsTaskbar && typeof tabsTaskbar.openWindow === 'function') {
                            tabsTaskbar.openWindow('replyTab')
                        }
                        fetchConversation()
                    }
                    if (payload && payload.type === 'conversation.deleted') {
                        conversation = []
                        showEmpty()
                        var tabsTaskbar = window.tabsTaskbar
                        if (tabsTaskbar && typeof tabsTaskbar.minimizeWindow === 'function') {
                            tabsTaskbar.minimizeWindow('replyTab')
                        }
                    }
                } catch {}
            })

            socket.addEventListener('close', function() {
                if (replySocket === socket) replySocket = null
                window.setTimeout(connectReplySocket, REPLY_RECONNECT_MS)
            })

            socket.addEventListener('error', function() {
                socket.close()
            })
        } catch {
            window.setTimeout(connectReplySocket, REPLY_RECONNECT_MS)
        }
    }

    function resetForm() {
        replyInput.value = ''
    }

    function startReplyCooldown() {
        replySendBtn.disabled = true
        var tick = function() {
            var remaining = Math.ceil(window.msUntilCanSend() / 1000)
            if (remaining <= 0) {
                replySendBtn.disabled = false
                replySendBtn.textContent = 'send'
                return
            }
            replySendBtn.textContent = remaining + 's'
            replySendBtn.disabled = true
            window.setTimeout(tick, 1000)
        }
        tick()
    }

    async function sendMessage(text) {
        if (!text || !userTag) return
        if (!window.canSendMessage()) return

        replySendBtn.disabled = true
        replySendBtn.textContent = 'sending...'

        try {
            await requestJson(joinUrl(apiBase, 'direct-messages'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: profileName || 'Anonymous',
                    userTag: userTag,
                    text: text
                })
            })

            resetForm()
            window.markMessageSent()
            startReplyCooldown()
            await fetchConversation()
        } catch (error) {
            replySendBtn.textContent = 'failed'
            window.setTimeout(function() {
                replySendBtn.textContent = 'send'
                replySendBtn.disabled = false
            }, 2000)
        }
    }

    replyForm.addEventListener('submit', function(event) {
        event.preventDefault()
        if (!chatEnabled) return
        if (replySendBtn.disabled) return

        profileName = getProfileName()
        var text = replyInput.value.trim()
        if (!text) return

        sendMessage(text)
    })

    replyInput.addEventListener('input', function() {
        if (!chatEnabled) return
        profileName = getProfileName()
    })

    userTag = getUserTag()
    profileName = getProfileName()

    if (chatEnabled && userTag && userTag.length >= 4) {
        fetchConversation()
        startReplyPolling()
        connectReplySocket()
    } else {
        if (emojiToggle) emojiToggle.disabled = true
    }

    window.addEventListener('beforeunload', function() {
        if (replySocket) replySocket.close()
    })
}

window.initReplyTab = initReplyTab
