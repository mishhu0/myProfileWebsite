function globalVolumeControl() {
    const volumeBtn = document.getElementById('utilsVolume')
    const popup = document.getElementById('volumePopup')
    const slider = document.getElementById('globalVolumeSlider')
    const label = document.getElementById('globalVolumeLabel')
    const vizVolumeInfo = document.getElementById('vizVolumeInfo')

    if (!volumeBtn || !popup || !slider || !label) return

    const STORAGE_KEY = 'globalVolume'
    const defaultVolume = 0.25

    function clamp01(value) {
        return Math.max(0, Math.min(1, value))
    }

    function setVolumeLabel(value) {
        label.textContent = Math.round(value * 100) + '%'
    }

    function setVizVolumeLabel(value) {
        if (!vizVolumeInfo) return
        vizVolumeInfo.textContent = Math.round(value * 100) + '%'
    }

    function applyGlobalVolume(value) {
        const safeValue = clamp01(value)
        const mediaElements = document.querySelectorAll('audio, video')
        const volumeFill = Math.round(safeValue * 100) + '%'

        mediaElements.forEach(function(media) {
            media.volume = safeValue
        })

        slider.value = String(Math.round(safeValue * 100))
        slider.style.setProperty('--volume-fill', volumeFill)
        setVolumeLabel(safeValue)
        setVizVolumeLabel(safeValue)
    }

    function positionPopup() {
        const rect = volumeBtn.getBoundingClientRect()
        const wasOpen = popup.classList.contains('is-open')

        if (!wasOpen) {
            popup.style.visibility = 'hidden'
            popup.classList.add('is-open')
        }

        const popupWidth = popup.offsetWidth
        const popupHeight = popup.offsetHeight
        const gap = 6

        let left = rect.left + (rect.width / 2) - (popupWidth / 2)
        if (left < 0) left = 0
        if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth

        let top = rect.top - popupHeight - gap
        if (top < 0) top = rect.bottom + gap

        popup.style.left = left + 'px'
        popup.style.top = top + 'px'

        if (!wasOpen) {
            popup.classList.remove('is-open')
            popup.style.visibility = ''
        }
    }

    function openPopup() {
        positionPopup()
        popup.style.zIndex = String(2147483647) // max safe z-index for volume popup
        popup.classList.add('is-open')
        popup.setAttribute('aria-hidden', 'false')
    }

    function closePopup() {
        popup.classList.remove('is-open')
        popup.style.zIndex = ''
        popup.setAttribute('aria-hidden', 'true')
    }

    function togglePopup() {
        if (popup.classList.contains('is-open')) closePopup()
        else openPopup()
    }

    window.openGlobalVolumePopup = openPopup
    window.closeGlobalVolumePopup = closePopup
    window.toggleGlobalVolumePopup = togglePopup

    const storedVolumeRaw = localStorage.getItem(STORAGE_KEY)
    const hasStoredVolume = storedVolumeRaw !== null && storedVolumeRaw !== ''
    const storedVolume = storedVolumeRaw === null ? Number.NaN : Number(storedVolumeRaw)
    const initialVolume = hasStoredVolume && Number.isFinite(storedVolume) ? clamp01(storedVolume) : defaultVolume
    applyGlobalVolume(initialVolume)

    volumeBtn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        togglePopup()
    })

    slider.addEventListener('input', function() {
        const nextVolume = clamp01(Number(this.value) / 100)
        applyGlobalVolume(nextVolume)
        localStorage.setItem(STORAGE_KEY, String(nextVolume))
    })

    popup.addEventListener('click', function(e) {
        e.stopPropagation()
    })

    document.addEventListener('click', function(e) {
        if (e.target === volumeBtn || volumeBtn.contains(e.target)) return
        if (popup.contains(e.target)) return
        closePopup()
    })

    window.addEventListener('resize', function() {
        if (!popup.classList.contains('is-open')) return
        positionPopup()
    })
}
