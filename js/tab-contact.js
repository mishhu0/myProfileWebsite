function initContactTab() {
	const contactTab = document.getElementById('contactTab')
	const emailLink = document.getElementById('contactEmailLink')
	const copyBtn = document.getElementById('contactCopyBtn')
	const note = document.getElementById('contactCopyNote')
	const noteText = document.getElementById('contactCopyNoteText')
	const dmForm = document.getElementById('contactDmForm')
	const dmInput = document.getElementById('contactDmInput')
	const dmSendBtn = document.getElementById('contactDmSendBtn')
	const dmStatus = document.getElementById('contactDmStatus')
	const baseServerConfig = (window.APP_CONFIG && window.APP_CONFIG.chat) || {}
	const contactConfig = (window.APP_CONFIG && window.APP_CONFIG.contact) || {}
	const dmEnabled = contactConfig.enabled !== undefined ? contactConfig.enabled !== false : baseServerConfig.enabled !== false
	const dmApiBase = String(
		contactConfig.apiBase
			|| baseServerConfig.apiBase
			|| (window.location.protocol === 'file:' ? 'http://127.0.0.1:8787/chat' : '/chat')
	).replace(/\/+$/, '')
	const dmDisabledMessage = String(contactConfig.disabledMessage || 'direct messages are unavailable right now')

	if (!contactTab || !emailLink || !copyBtn || !note) return

	let hideTimeout = null
	let statusResetTimer = null
	let isSending = false

	function getEmailText() {
		const text = String(emailLink.textContent || '').trim()
		if (text) return text

		const href = String(emailLink.getAttribute('href') || '')
		const match = href.match(/^mailto:([^?]+)/i)
		return match ? String(match[1]).trim() : ''
	}

	function setNoteOpen(isOpen) {
		contactTab.classList.toggle('is-copy-note-open', isOpen)
		note.setAttribute('aria-hidden', isOpen ? 'false' : 'true')
	}

	function joinUrl(base, suffix) {
		return String(base || '').replace(/\/+$/, '') + '/' + String(suffix || '').replace(/^\/+/, '')
	}

	function getProfileName() {
		if (typeof window.getStoredProfileName === 'function') {
			return String(window.getStoredProfileName() || '').trim()
		}

		return String(localStorage.getItem('profileName') || '').trim()
	}

	function getUserTag() {
		if (typeof window.getPersistentUserTag === 'function') {
			return String(window.getPersistentUserTag() || '').trim().toUpperCase()
		}

		return String(Math.random().toString(36).slice(2, 8) || '').trim().toUpperCase()
	}

	function normalizeDirectMessageText(value) {
		return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 600)
	}

	function setDmStatus(message, tone) {
		if (!dmStatus) return

		dmStatus.textContent = String(message || '')
		dmStatus.classList.toggle('is-error', tone === 'error')
		dmStatus.classList.toggle('is-success', tone === 'success')
	}

	function showTemporaryDmStatus(message, tone) {
		if (statusResetTimer) window.clearTimeout(statusResetTimer)
		setDmStatus(message, tone)

		statusResetTimer = window.setTimeout(function() {
			syncDmComposer()
		}, 2200)
	}

	async function requestJson(url, options) {
		const response = await fetch(url, options)
		const payload = await response.json().catch(function() {
			return {}
		})

		if (!response.ok) {
			throw new Error(payload && payload.error ? payload.error : 'Request failed.')
		}

		return payload
	}

	function updateDmAvailability() {
		if (!dmForm || !dmInput || !dmSendBtn) return

		const hasProfileName = Boolean(getProfileName())
		const hasMessage = Boolean(normalizeDirectMessageText(dmInput.value))

		contactTab.classList.toggle('is-dm-name-missing', dmEnabled && !hasProfileName)
		dmInput.disabled = !dmEnabled || !hasProfileName || isSending
		dmSendBtn.disabled = !dmEnabled || !hasProfileName || !hasMessage || isSending
	}

	function syncDmComposer() {
		if (!dmForm || !dmInput || !dmSendBtn || !dmStatus) return

		const profileName = getProfileName()
		const userTag = getUserTag()
		updateDmAvailability()

		if (!dmEnabled) {
			setDmStatus(dmDisabledMessage, 'error')
			return
		}

		if (!profileName) {
			setDmStatus('set your name in options first', 'error')
			return
		}

		if (isSending) {
			setDmStatus('sending as ' + profileName + ' #' + userTag + '...', '')
			return
		}

		setDmStatus('sending as ' + profileName + ' #' + userTag, '')
	}

	function positionNote(targetBtn) {
		const tabRect = contactTab.getBoundingClientRect()
		const btnRect = (targetBtn || copyBtn).getBoundingClientRect()

		const noteRect = note.getBoundingClientRect()

		let top = Math.round((btnRect.top - tabRect.top) + (btnRect.height - noteRect.height) / 2)
		const minTop = 6
		const maxTop = Math.max(minTop, Math.round(tabRect.height - noteRect.height - 6))
		top = Math.min(maxTop, Math.max(minTop, top))
		note.style.top = top + 'px'
	}

	async function copyToClipboard(value) {
		if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
			await navigator.clipboard.writeText(value)
			return
		}

		const textarea = document.createElement('textarea')
		textarea.value = value
		textarea.setAttribute('readonly', '')
		textarea.style.position = 'fixed'
		textarea.style.left = '-9999px'
		textarea.style.top = '0'
		document.body.appendChild(textarea)
		textarea.select()

		try {
			document.execCommand('copy')
		} finally {
			textarea.remove()
		}
	}

	function showCopiedNote(message, targetBtn) {
		if (hideTimeout) window.clearTimeout(hideTimeout)
		if (noteText) noteText.textContent = message

		setNoteOpen(true)
		positionNote(targetBtn)

		hideTimeout = window.setTimeout(function() {
			setNoteOpen(false)
		}, 1200)
	}

	copyBtn.addEventListener('click', function() {
		const email = getEmailText()
		if (!email) {
			showCopiedNote('no email found')
			return
		}

		Promise.resolve(copyToClipboard(email))
			.then(function() {
				showCopiedNote('email copied!')
			})
			.catch(function(error) {
				console.warn('Could not copy email:', error)
				showCopiedNote('copy failed!')
			})
	})

	window.addEventListener('resize', function() {
		if (!contactTab.classList.contains('is-copy-note-open')) return
		positionNote()
	})

	if (!dmForm || !dmInput || !dmSendBtn || !dmStatus) return

	dmInput.addEventListener('input', function() {
		syncDmComposer()
	})

	dmForm.addEventListener('submit', function(event) {
		event.preventDefault()

		if (!dmEnabled) {
			showTemporaryDmStatus(dmDisabledMessage, 'error')
			return
		}

		const profileName = getProfileName()
		const userTag = getUserTag()
		const text = normalizeDirectMessageText(dmInput.value)

		if (!profileName) {
			syncDmComposer()
			return
		}

		if (!text) {
			showTemporaryDmStatus('write a message first', 'error')
			return
		}

		isSending = true
		syncDmComposer()

		requestJson(joinUrl(dmApiBase, 'direct-messages'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name: profileName,
				userTag: userTag,
				text: text
			})
		}).then(function() {
			dmInput.value = ''
			isSending = false
			updateDmAvailability()
			showCopiedNote('message sent', dmSendBtn)
			syncDmComposer()
		}).catch(function(error) {
			isSending = false
			updateDmAvailability()
			showCopiedNote('message couldn\'t be sent', dmSendBtn)
			syncDmComposer()
		})
	})

	window.addEventListener('focus', function() {
		syncDmComposer()
	})

	syncDmComposer()
}

window.initContactTab = initContactTab
