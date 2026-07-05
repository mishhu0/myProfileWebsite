function globalVolumeControl() {
    const volumeBtn = document.getElementById('utilsVolume')
    const popup = document.getElementById('volumePopup')
    const slider = document.getElementById('globalVolumeSlider')
    const label = document.getElementById('globalVolumeLabel')
    const vizVolumeInfo = document.getElementById('vizVolumeInfo')

    if (!volumeBtn || !popup || !slider || !label) return

    const STORAGE_KEY = 'globalVolume'
    const defaultVolume = 0.25
    let activePopupAnchor = volumeBtn

    function isRotatedPortraitDesktop() {
        return window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches
    }

    function isPhonePortraitLayout() {
        return window.matchMedia('(orientation: portrait) and (max-width: 640px)').matches
    }

    function getDesktopLocalBounds() {
        const desktopRoot = document.getElementById('desktop-root')
        if (!desktopRoot) {
            return {
                width: window.innerWidth || document.documentElement.clientWidth || 0,
                height: window.innerHeight || document.documentElement.clientHeight || 0
            }
        }

        return {
            width: desktopRoot.clientWidth || 0,
            height: desktopRoot.clientHeight || 0
        }
    }

    function getDesktopLocalPointFromViewport(x, y) {
        const desktopRoot = document.getElementById('desktop-root')
        if (!desktopRoot) return { x, y }

        const rect = desktopRoot.getBoundingClientRect()
        if (!isRotatedPortraitDesktop()) {
            return { x: x - rect.left, y: y - rect.top }
        }

        const bounds = getDesktopLocalBounds()
        return {
            x: y - rect.top,
            y: bounds.height - (x - rect.left)
        }
    }

    function clamp01(value) {
        return Math.max(0, Math.min(1, value))
    }

    function setVolumeLabel(value) {
        label.textContent = Math.round(value * 100) + '%'
    }

    function setVizVolumeLabel(value) {
        if (!vizVolumeInfo) return
        if (isPhonePortraitLayout()) {
            vizVolumeInfo.textContent = 'phone'
            return
        }

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

    function getVisibleAnchor(anchorElement) {
        const anchors = [
            anchorElement,
            activePopupAnchor,
            volumeBtn,
            document.querySelector('.viz-setting-group--volume')
        ]

        for (const anchor of anchors) {
            if (!(anchor instanceof Element)) continue
            const rect = anchor.getBoundingClientRect()
            if (rect.width > 0 || rect.height > 0) {
                activePopupAnchor = anchor
                return {
                    element: anchor,
                    rect: rect
                }
            }
        }

        return {
            element: volumeBtn,
            rect: volumeBtn.getBoundingClientRect()
        }
    }

    function positionPopup(anchorElement) {
        const visibleAnchor = getVisibleAnchor(anchorElement)
        const rect = visibleAnchor.rect
        const anchor = visibleAnchor.element
        const wasOpen = popup.classList.contains('is-open')

        if (!wasOpen) {
            popup.style.visibility = 'hidden'
            popup.classList.add('is-open')
        }

        const popupWidth = popup.offsetWidth
        const popupHeight = popup.offsetHeight
        const gap = 6

        const anchorLocalWidth = anchor && anchor instanceof HTMLElement ? (anchor.offsetWidth || rect.width) : rect.width
        const anchorLocalHeight = anchor && anchor instanceof HTMLElement ? (anchor.offsetHeight || rect.height) : rect.height
        const anchorPoint = isRotatedPortraitDesktop()
            ? getDesktopLocalPointFromViewport(rect.right, rect.top)
            : getDesktopLocalPointFromViewport(rect.left, rect.top)
        const desktopBounds = getDesktopLocalBounds()

        let left = anchorPoint.x + (anchorLocalWidth / 2) - (popupWidth / 2)
        if (left < 0) left = 0
        if (left + popupWidth > desktopBounds.width) left = Math.max(0, desktopBounds.width - popupWidth)

        let top = anchorPoint.y - popupHeight - gap
        if (top < 0) top = anchorPoint.y + anchorLocalHeight + gap
        if (top + popupHeight > desktopBounds.height) top = Math.max(0, desktopBounds.height - popupHeight)

        popup.style.left = left + 'px'
        popup.style.top = top + 'px'

        if (!wasOpen) {
            popup.classList.remove('is-open')
            popup.style.visibility = ''
        }
    }

    function openPopup(anchorElement) {
        if (isPhonePortraitLayout()) return
        positionPopup(anchorElement)
        popup.style.zIndex = String(2147483647) // max safe z-index for volume popup
        popup.classList.add('is-open')
        popup.setAttribute('aria-hidden', 'false')
    }

    function closePopup() {
        popup.classList.remove('is-open')
        popup.style.zIndex = ''
        popup.setAttribute('aria-hidden', 'true')
    }

    function togglePopup(anchorElement) {
        if (isPhonePortraitLayout()) {
            closePopup()
            return
        }

        if (popup.classList.contains('is-open')) closePopup()
        else openPopup(anchorElement)
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
        togglePopup(volumeBtn)
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
        setVizVolumeLabel(clamp01(Number(slider.value) / 100))
        if (!popup.classList.contains('is-open')) return
        if (isPhonePortraitLayout()) {
            closePopup()
            return
        }
        positionPopup(activePopupAnchor)
    })
}
