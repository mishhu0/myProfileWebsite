let entityTabState = null

async function initEntityTab() {
	const tab = document.getElementById('entityTab')
	const canvas = document.getElementById('entityCanvas')
	if (!tab || !canvas) return
	if (entityTabState) return

	function getEntityRenderSize(shellRect) {
		const computedStyle = getComputedStyle(tab)
		const configuredWidth = parseFloat(computedStyle.getPropertyValue('--entity-render-width'))
		const configuredHeight = parseFloat(computedStyle.getPropertyValue('--entity-render-height'))
		const canvasRect = canvas.getBoundingClientRect()
		const fallbackRect = shellRect || tab.getBoundingClientRect()

		return {
			width: Number.isFinite(configuredWidth) && configuredWidth > 0
				? configuredWidth
				: Math.max(1, Math.floor(canvasRect.width || fallbackRect.width || 1)),
			height: Number.isFinite(configuredHeight) && configuredHeight > 0
				? configuredHeight
				: Math.max(1, Math.floor(canvasRect.height || fallbackRect.height || 1))
		}
	}

	function getEntityRenderOffsets(shellRect) {
		const renderSize = getEntityRenderSize(shellRect)
		return {
			offsetX: (renderSize.width - shellRect.width) / 2,
			offsetY: (renderSize.height - shellRect.height) / 2,
			width: renderSize.width,
			height: renderSize.height
		}
	}

	function getEntityRenderRect(shellRect) {
		const rect = shellRect || tab.getBoundingClientRect()
		const renderMetrics = getEntityRenderOffsets(rect)
		const left = rect.left - renderMetrics.offsetX
		const top = rect.top - renderMetrics.offsetY

		return {
			left,
			top,
			width: renderMetrics.width,
			height: renderMetrics.height,
			right: left + renderMetrics.width,
			bottom: top + renderMetrics.height
		}
	}

	function getShellRectForRenderRect(renderRect, shellRect) {
		const rect = shellRect || tab.getBoundingClientRect()
		const renderMetrics = getEntityRenderOffsets(rect)
		return {
			left: renderRect.left + renderMetrics.offsetX,
			top: renderRect.top + renderMetrics.offsetY,
			width: rect.width,
			height: rect.height
		}
	}

	function getInitialHomeRect() {
		const initialRect = tab.getBoundingClientRect()
		const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0
		const renderMetrics = getEntityRenderOffsets(initialRect)
		const margin = 20
		const left = Math.max(margin, viewportWidth - renderMetrics.width - margin) + renderMetrics.offsetX
		return {
			left,
			top: margin + renderMetrics.offsetY,
			width: initialRect.width,
			height: initialRect.height
		}
	}

	// Ensure the overlay uses explicit pixel positioning so it can animate.
	const initialRect = getInitialHomeRect()
	tab.style.left = initialRect.left + 'px'
	tab.style.top = initialRect.top + 'px'
	tab.style.width = initialRect.width + 'px'
	tab.style.height = initialRect.height + 'px'
	tab.style.right = 'auto'
	tab.style.bottom = 'auto'
	tab.style.transform = 'none'

	let homeRect = {
		left: initialRect.left,
		top: initialRect.top,
		width: initialRect.width,
		height: initialRect.height
	}

	function setMoveLocked(isLocked) {
		tab.dataset.moveLocked = isLocked ? 'true' : 'false'
	}

	function createEntityChatShell() {
		document.querySelectorAll('.entity-chat').forEach(function(existingChat) {
			existingChat.remove()
		})

		const root = document.createElement('section')
		root.className = 'entity-chat entity-chat--hidden'
		root.setAttribute('aria-live', 'polite')
		root.setAttribute('aria-label', 'Entity chat')

		const body = document.createElement('div')
		body.className = 'entity-chat__body'

		const closeActions = document.createElement('div')
		closeActions.className = 'entity-chat__actions tab-right no-select'

		const closeButton = document.createElement('button')
		closeButton.type = 'button'
		closeButton.className = 'entity-chat__close'
		closeButton.setAttribute('aria-label', 'Close entity chat')

		const closeIcon = document.createElement('img')
		closeIcon.src = 'images/close.svg'
		closeIcon.alt = 'close icon'
		closeButton.appendChild(closeIcon)
		closeActions.appendChild(closeButton)

		const messages = document.createElement('div')
		messages.className = 'entity-chat__messages'

		body.appendChild(closeActions)
		body.appendChild(messages)
		root.appendChild(body)
		document.body.appendChild(root)

		return {
			root,
			body,
			messages,
			closeButton
		}
	}

	function clamp(value, min, max) {
		if (max < min) return min
		return Math.min(Math.max(value, min), max)
	}

	function getMessageList(config) {
		if (Array.isArray(config.messages)) return config.messages
		if (Array.isArray(config.lines)) return config.lines
		if (typeof config.message === 'string') return [config.message]
		return []
	}

	function getEntityChatPlacement(chatConfig) {
		const placement = typeof chatConfig.placement === 'string' ? chatConfig.placement.trim() : ''
		const aliases = {
			'right-up': 'right-up',
			'right-down': 'right-down',
			'left-up': 'left-up',
			'left-down': 'left-down',
			'upper-right': 'right-up',
			'upper-left': 'left-up',
			'lower-right': 'right-down',
			'lower-left': 'left-down'
		}
		return aliases[placement] || placement || 'corner-auto'
	}

	function normalizeEntityChatConfig(config, fallbackId) {
		const chatConfig = config && typeof config === 'object' ? config : {}
		const fallbackSpeaker = typeof chatConfig.speaker === 'string' && chatConfig.speaker.trim()
			? chatConfig.speaker.trim()
			: '꩜'
		const messages = getMessageList(chatConfig)
			.map(function(message) {
				if (typeof message === 'string') {
					return {
						author: fallbackSpeaker,
						text: message.trim()
					}
				}

            if (!message || typeof message !== 'object') return null
				const text = typeof message.text === 'string' ? message.text.trim() : ''
				const author = typeof message.author === 'string' && message.author.trim()
					? message.author.trim()
					: fallbackSpeaker
				return text
					? {
						author,
						text,
						button: Boolean(message.button)
					}
					: null
			})
			.filter(Boolean)

		return {
			id: fallbackId || chatConfig.id || '',
			title: typeof chatConfig.title === 'string' && chatConfig.title.trim() ? chatConfig.title.trim() : 'Entity Chat',
			messages,
			autoHideMs: Number.isFinite(chatConfig.autoHideMs) && chatConfig.autoHideMs > 0
				? chatConfig.autoHideMs
				: 0,
			gap: Number.isFinite(chatConfig.gap) && chatConfig.gap >= 6 ? chatConfig.gap : 12,
			placement: getEntityChatPlacement(chatConfig),
			offsetX: Number.isFinite(chatConfig.offsetX) ? chatConfig.offsetX : 0,
			offsetY: Number.isFinite(chatConfig.offsetY) ? chatConfig.offsetY : 0
		}
	}

	const entityChat = createEntityChatShell()
	const chatRegistry = new Map()
	let activeChat = null
	let chatAutoHideId = 0
	let pendingChatPositionId = 0
	let chatPositionTrackUntil = 0

	function clearChatAutoHide() {
		if (!chatAutoHideId) return
		window.clearTimeout(chatAutoHideId)
		chatAutoHideId = 0
	}

	function startChatPositionTracking(durationMs = 900) {
		chatPositionTrackUntil = Math.max(chatPositionTrackUntil, performance.now() + durationMs)
	}

	function renderEntityChat(config) {
		entityChat.messages.textContent = ''

		config.messages.forEach(function(message) {
			const line = document.createElement('div')
			line.className = 'entity-chat__line'

			const author = document.createElement('span')
			author.className = 'entity-chat__author'
			author.textContent = message.author + ':'

			const text = document.createElement('span')
			text.className = 'entity-chat__text'
			text.textContent = message.text

			line.appendChild(author)
			line.appendChild(text)

			if (message.button) {
				const fsBtn = document.createElement('button')
				fsBtn.type = 'button'
				fsBtn.className = 'entity-chat__fullscreen-btn'
				fsBtn.textContent = 'go fullscreen'
				fsBtn.addEventListener('click', function(e) {
					e.stopPropagation()
					if (document.documentElement.requestFullscreen) {
						document.documentElement.requestFullscreen()
					}
				})
				text.appendChild(fsBtn)
			}
			entityChat.messages.appendChild(line)
		})
	}

	function isEntityVisible() {
		return getComputedStyle(tab).display !== 'none'
	}

	function positionEntityChat() {
		if (!activeChat) {
			entityChat.root.classList.add('entity-chat--hidden')
			return
		}

		if (!isEntityVisible()) {
			entityChat.root.classList.add('entity-chat--hidden')
			return
		}

		entityChat.root.classList.remove('entity-chat--hidden')
		entityChat.root.style.visibility = 'hidden'

		const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0
		const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0
		const entityRect = getEntityRenderRect()
		const chatRect = entityChat.root.getBoundingClientRect()
		const margin = 12
		const gap = activeChat.gap
		const maxLeft = Math.max(margin, viewportWidth - chatRect.width - margin)
		const maxTop = Math.max(margin, viewportHeight - chatRect.height - margin)
		const placementCandidates = [
			{
				name: 'right-up',
				left: entityRect.right + gap,
				top: entityRect.top - chatRect.height - gap * 2
			},
			{
				name: 'right-down',
				left: entityRect.right + gap,
				top: entityRect.bottom + gap
			},
			{
				name: 'right',
				left: entityRect.right + gap,
				top: entityRect.top + (entityRect.height - chatRect.height) / 2
			},
			{
				name: 'left-up',
				left: entityRect.left - chatRect.width - gap,
				top: entityRect.top - chatRect.height - gap * 2
			},
			{
				name: 'left-down',
				left: entityRect.left - chatRect.width - gap,
				top: entityRect.bottom + gap
			},
			{
				name: 'left',
				left: entityRect.left - chatRect.width - gap,
				top: entityRect.top + (entityRect.height - chatRect.height) / 2
			},
			{
				name: 'top-right-corner',
				left: entityRect.right - chatRect.width / 2,
				top: entityRect.top - chatRect.height / 2
			},
			{
				name: 'bottom-right-corner',
				left: entityRect.right - chatRect.width / 2,
				top: entityRect.bottom - chatRect.height / 2
			},
			{
				name: 'top-left-corner',
				left: entityRect.left - chatRect.width / 2,
				top: entityRect.top - chatRect.height / 2
			},
			{
				name: 'bottom-left-corner',
				left: entityRect.left - chatRect.width / 2,
				top: entityRect.bottom - chatRect.height / 2
			}
		]

		const currentPlacement = activeChat.placement
		const preferredPlacements = currentPlacement === 'corner-auto'
			? ['top-right-corner', 'bottom-right-corner', 'top-left-corner', 'bottom-left-corner']
			: [currentPlacement]

		const bestPlacement = preferredPlacements.reduce(function(best, placementName) {
			const candidate = placementCandidates.find(function(entry) {
				return entry.name === placementName
			})
			if (!candidate) return best

			const left = candidate.left + activeChat.offsetX
			const top = candidate.top + activeChat.offsetY
			const overflow = Math.max(0, margin - left)
				+ Math.max(0, left - maxLeft)
				+ Math.max(0, margin - top)
				+ Math.max(0, top - maxTop)

			if (!best || overflow < best.overflow) {
				return { candidate, left, top, overflow }
			}

			return best
		}, null)

		entityChat.root.dataset.corner = bestPlacement ? bestPlacement.candidate.name : ''
		const resolvedLeft = bestPlacement ? bestPlacement.left : entityRect.right
		const resolvedTop = bestPlacement ? bestPlacement.top : entityRect.top
		entityChat.root.style.left = clamp(resolvedLeft, margin, maxLeft) + 'px'
		entityChat.root.style.top = clamp(resolvedTop, margin, maxTop) + 'px'
		entityChat.root.style.visibility = ''
	}

	function scheduleEntityChatPosition() {
		if (pendingChatPositionId) return
		pendingChatPositionId = requestAnimationFrame(function() {
			pendingChatPositionId = 0
			positionEntityChat()
		})
	}

	function hideEntityChat() {
		activeChat = null
		clearChatAutoHide()
		entityChat.root.classList.add('entity-chat--hidden')
	}

	function registerEntityChat(id, config) {
		if (typeof id !== 'string' || !id.trim()) return false
		chatRegistry.set(id.trim(), config && typeof config === 'object' ? { ...config } : {})
		return true
	}

	function registerEntityChats(configs) {
		if (!configs || typeof configs !== 'object') return []
		return Object.entries(configs).reduce(function(ids, entry) {
			const id = entry[0]
			const config = entry[1]
			if (registerEntityChat(id, config)) ids.push(id)
			return ids
		}, [])
	}

	function showEntityChat(chatOrId, overrides) {
		let rawConfig = chatOrId
		let fallbackId = ''

		if (typeof chatOrId === 'string') {
			fallbackId = chatOrId
			rawConfig = chatRegistry.get(chatOrId)
			if (!rawConfig) {
				console.warn('Unknown entity chat:', chatOrId)
				return false
			}
			rawConfig = overrides && typeof overrides === 'object'
				? { ...rawConfig, ...overrides }
				: rawConfig
		}

		const config = normalizeEntityChatConfig(rawConfig, fallbackId)
		if (!config.messages.length) return false

		clearChatAutoHide()
		activeChat = config
		renderEntityChat(config)
		startChatPositionTracking(1200)
		scheduleEntityChatPosition()

		if (config.autoHideMs > 0) {
			chatAutoHideId = window.setTimeout(function() {
				hideEntityChat()
			}, config.autoHideMs)
		}

		return true
	}

	function handleEntityChatShowRequest(event) {
		const detail = event.detail
		if (typeof detail === 'string') {
			showEntityChat(detail)
			return
		}

		if (!detail || typeof detail !== 'object') return
		if (typeof detail.chat === 'string') {
			showEntityChat(detail.chat, detail.overrides)
			return
		}

		if (typeof detail.id === 'string' && chatRegistry.has(detail.id)) {
			showEntityChat(detail.id, detail.overrides)
			return
		}

		showEntityChat(detail)
	}

	entityChat.closeButton.addEventListener('click', hideEntityChat)
	window.addEventListener('resize', scheduleEntityChatPosition)
	window.addEventListener('entitychat:show', handleEntityChatShowRequest)

	window.entityChat = {
		register: registerEntityChat,
		registerMany: registerEntityChats,
		show: showEntityChat,
		hide: hideEntityChat,
		reposition: scheduleEntityChatPosition,
		list: function() {
			return Array.from(chatRegistry.keys())
		}
	}

	let renderer = null
	let camera = null
	let lastRenderWidth = 0
	let lastRenderHeight = 0
	let resizeUntil = 0

	function resize() {
		if (!renderer || !camera) return
		const host = canvas
		if (!host) return

		const rect = host.getBoundingClientRect()
		const width = Math.max(1, Math.floor(rect.width))
		const height = Math.max(1, Math.floor(rect.height))

		if (width === lastRenderWidth && height === lastRenderHeight) return
		lastRenderWidth = width
		lastRenderHeight = height

		renderer.setSize(width, height, false)
		camera.aspect = width / height
		camera.updateProjectionMatrix()
	}

	function startTransitionResizeTracking(durationMs = 520) {
		resizeUntil = Math.max(resizeUntil, performance.now() + durationMs)
	}

	function getTransitionTimeMs(element) {
		if (!element) return 0
		const computedStyle = getComputedStyle(element)
		const durations = computedStyle.transitionDuration.split(',').map(function(value) {
			const trimmed = value.trim()
			if (!trimmed) return 0
			return trimmed.endsWith('ms') ? parseFloat(trimmed) : parseFloat(trimmed) * 1000
		})
		const delays = computedStyle.transitionDelay.split(',').map(function(value) {
			const trimmed = value.trim()
			if (!trimmed) return 0
			return trimmed.endsWith('ms') ? parseFloat(trimmed) : parseFloat(trimmed) * 1000
		})

		return durations.reduce(function(maxTime, duration, index) {
			const delay = delays[index] || delays[0] || 0
			return Math.max(maxTime, duration + delay)
		}, 0)
	}

	let pendingSnapId = 0
	function snapEntityToRect(rect, options) {
		if (!rect) return
		if (pendingSnapId) cancelAnimationFrame(pendingSnapId)
		pendingSnapId = requestAnimationFrame(function() {
			pendingSnapId = 0
			const immediate = Boolean(options && options.immediate)
			if (!immediate && activeChat) {
				hideEntityChat()
			}
			if (immediate) {
				tab.classList.add('entity-tab--no-transition')
			} else {
				tab.classList.remove('entity-tab--no-transition')
			}

			tab.style.left = rect.left + 'px'
			tab.style.top = rect.top + 'px'
			tab.style.width = rect.width + 'px'
			tab.style.height = rect.height + 'px'
			if (!immediate) startTransitionResizeTracking(720)
			startChatPositionTracking(900)
			scheduleEntityChatPosition()
			resize()
		})
	}

	function moveEntityNextToElement(element, options) {
		if (!element || typeof element.getBoundingClientRect !== 'function') return Promise.resolve(false)

		const targetRect = element.getBoundingClientRect()
		if (targetRect.width < 8 || targetRect.height < 8) return Promise.resolve(false)

		const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0
		const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0
		const margin = Number.isFinite(options && options.margin) ? options.margin : 20
		const gap = Number.isFinite(options && options.gap) ? options.gap : 12
		const currentRect = tab.getBoundingClientRect()
		const shellRect = {
			left: currentRect.width > 0 ? currentRect.left : homeRect.left,
			top: currentRect.height > 0 ? currentRect.top : homeRect.top,
			width: Math.max(1, currentRect.width || homeRect.width),
			height: Math.max(1, currentRect.height || homeRect.height)
		}
		const currentRenderRect = getEntityRenderRect(shellRect)
		const width = Math.max(1, currentRenderRect.width)
		const height = Math.max(1, currentRenderRect.height)
		const maxLeft = Math.max(margin, viewportWidth - width - margin)
		const maxTop = Math.max(margin, viewportHeight - height - margin)

		const candidates = [
			{
				left: targetRect.right + gap,
				top: targetRect.top
			},
			{
				left: targetRect.left - width - gap,
				top: targetRect.top
			},
			{
				left: targetRect.left,
				top: targetRect.bottom + gap
			},
			{
				left: targetRect.left,
				top: targetRect.top - height - gap
			}
		]

		const bestCandidate = candidates.reduce(function(best, candidate) {
			const overflow = Math.max(0, margin - candidate.left)
				+ Math.max(0, candidate.left - maxLeft)
				+ Math.max(0, margin - candidate.top)
				+ Math.max(0, candidate.top - maxTop)

			if (!best || overflow < best.overflow) {
				return {
					left: clamp(candidate.left, margin, maxLeft),
					top: clamp(candidate.top, margin, maxTop),
					overflow
				}
			}

			return best
		}, null)

		if (!bestCandidate) return Promise.resolve(false)

		const targetRenderRect = {
			left: bestCandidate.left,
			top: bestCandidate.top,
			width,
			height
		}
		const targetRectForEntity = getShellRectForRenderRect(targetRenderRect, shellRect)
		const isAlreadyThere = Math.abs(currentRenderRect.left - targetRenderRect.left) < 1
			&& Math.abs(currentRenderRect.top - targetRenderRect.top) < 1
			&& Math.abs(currentRenderRect.width - targetRenderRect.width) < 1
			&& Math.abs(currentRenderRect.height - targetRenderRect.height) < 1

		tab.style.display = 'block'
		snapEntityToRect(targetRectForEntity)

		if (isAlreadyThere) return Promise.resolve(true)

		return new Promise(function(resolve) {
			const fallbackDelay = Math.max(40, getTransitionTimeMs(tab) + 60)
			let settled = false

			function finish() {
				if (settled) return
				settled = true
				tab.removeEventListener('transitionend', handleTransitionEnd)
				window.clearTimeout(fallbackId)
				resolve(true)
			}

			function handleTransitionEnd(event) {
				if (event.target !== tab) return
				if (!/^(left|top|width|height)$/.test(event.propertyName)) return
				finish()
			}

			const fallbackId = window.setTimeout(finish, fallbackDelay)
			tab.addEventListener('transitionend', handleTransitionEnd)
		})
	}

	registerEntityChats({
		intro: {
			title: '...',
			placement: 'left-down',
			gap: 0,
			offsetX: 40,
			offsetY: -30,
			messages: [
				'Welcome!',
            	'As you can see this website is inspired by Windows 95/98 and it is meant as my profile/blog/portfolio. Feel free to explore it!',
				{ text: 'Full screen is recommended for the best experience.', button: true }
			]
		}
	})

	function showStartupEntityChat() {
		const startupDelay = Math.max(160, getTransitionTimeMs(tab) + 120)
		window.setTimeout(function() {
			requestAnimationFrame(function() {
				if (activeChat || isAboutVisible()) return
				startChatPositionTracking(1600)
				showEntityChat('intro')
			})
		}, startupDelay)
	}

	const aboutTab = document.getElementById('aboutTab')
	const aboutPictureFrame = document.querySelector('#aboutTab .about-pic')

	function isAboutVisible() {
		if (!aboutTab) return false
		return getComputedStyle(aboutTab).display !== 'none'
	}

	function syncAboutEntityLayer() {
		if (!tab) return

		if (!isAboutVisible() || !aboutTab) {
			tab.style.removeProperty('z-index')
			return
		}

		const aboutZIndex = Number(aboutTab.style.zIndex || 0)
		tab.style.setProperty('z-index', String(aboutZIndex), 'important')
	}

	function updateAboutSnap() {
		if (!aboutTab || !aboutPictureFrame) return

		if (!isAboutVisible()) {
			setMoveLocked(false)
			syncAboutEntityLayer()
			snapEntityToRect(homeRect)
			return
		}

		syncAboutEntityLayer()

		const rect = aboutPictureFrame.getBoundingClientRect()
		// When About just opened, layout can briefly report a tiny/zero rect.
		// Snapping to that makes the entity look like it disappears/teleports.
		if (rect.width < 8 || rect.height < 8) {
			requestAnimationFrame(updateAboutSnap)
			return
		}

		hideEntityChat()
		snapEntityToRect(rect)
	}

	// Save home position when the user drags the entity (only when About is closed).
	let entityPointerDown = false
	tab.addEventListener('mousedown', function(e) {
		if (e.button !== 0) return
		if (tab.dataset.moveLocked === 'true') return
		if (isAboutVisible()) return
		entityPointerDown = true
	})

	document.addEventListener('mouseup', function() {
		if (!entityPointerDown) return
		entityPointerDown = false
		if (isAboutVisible()) return

		const rect = tab.getBoundingClientRect()
		homeRect = {
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height
		}
		scheduleEntityChatPosition()
	})

	if (aboutTab && aboutPictureFrame) {
		const aboutObserver = new MutationObserver(function() {
			updateAboutSnap()
		})
		aboutObserver.observe(aboutTab, { attributes: true, attributeFilter: ['style', 'class'] })

		const aboutImgObserver = new ResizeObserver(function() {
			updateAboutSnap()
		})
		aboutImgObserver.observe(aboutPictureFrame)

		window.addEventListener('resize', updateAboutSnap)
		updateAboutSnap()
	}

	const THREE = await import('three')
	const scene = new THREE.Scene()

	camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
	camera.position.set(0, 0, 2)

	renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		premultipliedAlpha: false
	})
	renderer.setClearColor(0x000000, 0)
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

	const geometry = new THREE.BoxGeometry(1, 1, 1)
	const material = new THREE.MeshNormalMaterial()
	const mesh = new THREE.Mesh(geometry, material)
	scene.add(mesh)

	let rafId = null
	function frame(now) {
		rafId = requestAnimationFrame(frame)
		if (now && now < resizeUntil) resize()
		if (activeChat && now && now < chatPositionTrackUntil) positionEntityChat()
		mesh.rotation.x += 0.004
		mesh.rotation.y += 0.005
		renderer.render(scene, camera)
	}

	function start() {
		if (rafId !== null) return
		frame()
	}

	function stop() {
		if (rafId === null) return
		cancelAnimationFrame(rafId)
		rafId = null
	}

	const resizeObserver = new ResizeObserver(function() {
		resize()
		startChatPositionTracking(900)
		scheduleEntityChatPosition()
	})
	resizeObserver.observe(canvas)

	const entityBoundsObserver = new ResizeObserver(function() {
		startChatPositionTracking(900)
		scheduleEntityChatPosition()
	})
	entityBoundsObserver.observe(tab)

	const chatPositionObserver = new MutationObserver(function() {
		startChatPositionTracking(900)
		scheduleEntityChatPosition()
	})
	chatPositionObserver.observe(tab, { attributes: true, attributeFilter: ['style', 'class'] })

	const visibilityObserver = new MutationObserver(function() {
		const isVisible = getComputedStyle(tab).display !== 'none'
		if (isVisible) {
			resize()
			startChatPositionTracking(900)
			scheduleEntityChatPosition()
			start()
		} else {
			hideEntityChat()
			stop()
		}
	})
	visibilityObserver.observe(tab, { attributes: true, attributeFilter: ['style', 'class'] })

	window.entity3d = {
		scene,
		camera,
		renderer,
		mesh,
		start,
		stop,
		resize,
		moveNextToElement: moveEntityNextToElement,
		chat: window.entityChat
	}

	entityTabState = {
		tab,
		canvas,
		scene,
		camera,
		renderer,
		mesh,
		start,
		stop,
		resize,
		moveNextToElement: moveEntityNextToElement,
		chat: window.entityChat,
		resizeObserver,
		entityBoundsObserver,
		chatPositionObserver,
		visibilityObserver
	}

	resize()
	scheduleEntityChatPosition()
	start()
	showStartupEntityChat()
}

window.initEntityTab = initEntityTab
