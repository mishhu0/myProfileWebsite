function initContactTab() {
	const contactTab = document.getElementById('contactTab')
	const emailLink = document.getElementById('contactEmailLink')
	const copyBtn = document.getElementById('contactCopyBtn')
	const note = document.getElementById('contactCopyNote')
	const noteText = document.getElementById('contactCopyNoteText')

	if (!contactTab || !emailLink || !copyBtn || !note) return

	let hideTimeout = null

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

	function positionNote() {
		const tabRect = contactTab.getBoundingClientRect()
		const btnRect = copyBtn.getBoundingClientRect()

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

	function showCopiedNote(message) {
		if (hideTimeout) window.clearTimeout(hideTimeout)
		if (noteText) noteText.textContent = message

		setNoteOpen(true)
		positionNote()

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
}

window.initContactTab = initContactTab
