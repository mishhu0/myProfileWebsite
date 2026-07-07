function initVisitorsTab() {
    const visitorsTab = document.getElementById('visitorsTab')
    const totalCount = document.getElementById('visitorsTotalCount')
    const identityMessage = document.getElementById('visitorsIdentityMessage')
    const identityTag = document.getElementById('visitorsIdentityTag')

    if (!visitorsTab || !totalCount || !identityMessage || !identityTag) return

    const visitorsConfig = (window.APP_CONFIG && window.APP_CONFIG.visitors) || {}
    const visitorsEnabled = visitorsConfig.enabled !== false
    const visitorsDebug = Boolean(visitorsConfig.debug)
    const disabledMessage = String(visitorsConfig.disabledMessage || 'Visitor counter is disabled right now.')
    const offlineMessage = String(visitorsConfig.offlineMessage || 'Visitor counter is unavailable right now.')
    const pendingRegistrationMessage = String(visitorsConfig.pendingRegistrationMessage || 'interact with the page to get your visitor number')
    const visitorsApiBase = String(visitorsConfig.apiBase || (window.location.protocol === 'file:' ? 'http://127.0.0.1:8787/chat' : '/chat')).replace(/\/+$/, '')
    const visitorsWsUrl = resolveWebSocketUrl(visitorsConfig.wsUrl, visitorsApiBase)

    let activeSocket = null
    let reconnectTimer = 0
    let currentUserTag = ''
    let currentTotalVisitors = 0
    let healthPollTimer = 0
    let hasInteractionTrigger = false
    let hasRegisteredVisitor = false
    let isRegisteringVisitor = false

    const passiveListenerOptions = { passive: true }
    const activationListeners = [
        ['pointerdown', passiveListenerOptions],
        ['touchstart', passiveListenerOptions],
        ['wheel', passiveListenerOptions],
        ['keydown', undefined],
        ['focusin', undefined]
    ]

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

    function createFallbackUserTag() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID().slice(0, 6).toLowerCase()
        }

        return Math.random().toString(36).slice(2, 8).toLowerCase()
    }

    function getUserTag() {
        if (typeof window.getPersistentUserTag === 'function') {
            return window.getPersistentUserTag()
        }

        let storedTag = String(localStorage.getItem('chatUserTag') || '').trim().toLowerCase()
        if (!/^[a-z0-9]{4,8}$/.test(storedTag)) {
            storedTag = createFallbackUserTag()
            localStorage.setItem('chatUserTag', storedTag)
        }

        return storedTag
    }

    function setTotalVisitors(value) {
        currentTotalVisitors = Math.max(0, Number(value) || 0)
        totalCount.textContent = String(currentTotalVisitors)
    }

    function setMessage(value) {
        identityMessage.textContent = String(value || 'you are visitor #0')
    }

    function setTag(value) {
        const safeValue = String(value || '').trim().toLowerCase()
        identityTag.textContent = safeValue ? 'saved tag #' + safeValue : 'saved tag unavailable'
    }

    function bindInteractionRegistration() {
        activationListeners.forEach(function(listenerConfig) {
            const eventName = listenerConfig[0]
            const eventOptions = listenerConfig[1]
            window.addEventListener(eventName, handleFirstInteraction, eventOptions)
        })
    }

    function unbindInteractionRegistration() {
        activationListeners.forEach(function(listenerConfig) {
            const eventName = listenerConfig[0]
            const eventOptions = listenerConfig[1]
            window.removeEventListener(eventName, handleFirstInteraction, eventOptions)
        })
    }

    function applyRegistration(result) {
        const visitor = result && result.visitor ? result.visitor : null
        const visitorNumber = Math.max(0, Number(visitor && visitor.visitorNumber) || 0)
        const totalVisitors = Math.max(visitorNumber, Number(result && result.totalVisitors) || 0)

        setTotalVisitors(totalVisitors)
        setTag(currentUserTag)

        if (!visitorNumber) {
            setMessage('you are visitor #0')
            return
        }

        if (result && result.isNew) {
            setMessage('you are the number ' + visitorNumber + ' visitor')
            return
        }

        setMessage('you are visitor #' + visitorNumber)
    }

    async function syncVisitorHealth() {
        try {
            const response = await fetch(joinUrl(visitorsApiBase, 'health'), {
                headers: {
                    Accept: 'application/json'
                }
            })

            const payload = await response.json().catch(function() {
                return {}
            })

            if (!response.ok) {
                throw new Error(payload && payload.error ? payload.error : 'Could not load visitor count.')
            }

            if (payload && payload.visitorCount !== undefined) {
                setTotalVisitors(payload.visitorCount)
            }
        } catch (error) {
            if (visitorsDebug) {
                console.warn('Could not load visitor count:', error)
            }
        }
    }

    async function registerVisitor() {
        if (!hasInteractionTrigger || hasRegisteredVisitor || isRegisteringVisitor) return

        currentUserTag = getUserTag()
        setTag(currentUserTag)
        isRegisteringVisitor = true
        setMessage('checking your visitor number...')

        try {
            const response = await fetch(joinUrl(visitorsApiBase, 'visitors'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userTag: currentUserTag })
            })

            const payload = await response.json().catch(function() {
                return {}
            })

            if (!response.ok) {
                throw new Error(payload && payload.error ? payload.error : 'Could not register visitor.')
            }

            applyRegistration(payload)
            hasRegisteredVisitor = true
            unbindInteractionRegistration()
        } catch (error) {
            if (visitorsDebug) {
                console.warn('Could not register visitor:', error)
            }

            setTotalVisitors(currentTotalVisitors)
            setMessage(offlineMessage)
        } finally {
            isRegisteringVisitor = false
        }
    }

    function handleFirstInteraction() {
        if (hasInteractionTrigger) return

        hasInteractionTrigger = true
        registerVisitor()
    }

    function scheduleReconnect() {
        if (reconnectTimer || !visitorsEnabled) return

        reconnectTimer = window.setTimeout(function() {
            reconnectTimer = 0
            connectSocket()
        }, 2000)
    }

    function connectSocket() {
        if (!visitorsEnabled || !visitorsWsUrl) return

        try {
            const socket = new WebSocket(visitorsWsUrl)
            activeSocket = socket

            socket.addEventListener('message', function(event) {
                try {
                    const rawPayload = typeof event.data === 'string' ? event.data.trim() : ''
                    if (!rawPayload || (rawPayload.charAt(0) !== '{' && rawPayload.charAt(0) !== '[')) {
                        return
                    }

                    const payload = JSON.parse(rawPayload)
                    if (!payload || payload.type !== 'visitor.registered') return

                    if (payload.totalVisitors !== undefined) {
                        setTotalVisitors(payload.totalVisitors)
                    }

                    if (payload.visitor && String(payload.visitor.userTag || '').trim().toLowerCase() === currentUserTag) {
                        applyRegistration({
                            isNew: true,
                            totalVisitors: payload.totalVisitors,
                            visitor: payload.visitor
                        })
                    }
                } catch (error) {
                    if (visitorsDebug) {
                        console.warn('Could not parse visitor socket payload:', error)
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
            if (visitorsDebug) {
                console.warn('Could not connect visitor socket:', error)
            }
            scheduleReconnect()
        }
    }

    function pollVisitorState() {
        if (hasInteractionTrigger && !hasRegisteredVisitor) {
            registerVisitor()
            return
        }

        syncVisitorHealth()
    }

    function startHealthPolling() {
        healthPollTimer = window.setInterval(function() {
            pollVisitorState()
        }, 30000)
    }

    window.addEventListener('beforeunload', function() {
        window.clearTimeout(reconnectTimer)
        window.clearInterval(healthPollTimer)
        if (activeSocket) {
            activeSocket.close()
            activeSocket = null
        }
    })

    setTotalVisitors(0)
    currentUserTag = getUserTag()
    setTag(currentUserTag)

    if (!visitorsEnabled) {
        setMessage(disabledMessage)
        return
    }

    setMessage(pendingRegistrationMessage)
    bindInteractionRegistration()
    connectSocket()
    syncVisitorHealth()
    startHealthPolling()
}

window.initVisitorsTab = initVisitorsTab