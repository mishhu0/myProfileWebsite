function getPicturesFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || "data couldn't be found - working on it..."
}

async function initPicturesTab() {
    const picturesTab = document.getElementById('picturesTab')
    const content = document.querySelector('.pictures-content')
    const gridWrap = document.querySelector('.pictures-grid-wrap')
    const grid = document.getElementById('picturesGrid')
    const detail = document.getElementById('picturesDetail')
    const detailCard = document.getElementById('picturesDetailCard')
    const detailImage = document.getElementById('picturesDetailImage')
    const detailTitle = document.getElementById('picturesDetailTitle')
    const detailDescription = document.getElementById('picturesDetailDescription')
    const backBtn = document.getElementById('picturesBackBtn')
    const nextBtn = document.getElementById('picturesNextBtn')
    const closeBtn = document.getElementById('picturesCloseBtn')
    const fullscreenBtn = document.getElementById('picturesFullscreenBtn')
    const fullscreenCloseBtn = document.getElementById('picturesFullscreenCloseBtn')
    const stage = document.getElementById('picturesStage')
    const counter = document.getElementById('picturesCounter')
    const infoText = document.getElementById('picturesInfo')
    const hoverNote = document.getElementById('picturesHoverNote')
    const hoverNoteText = document.getElementById('picturesHoverNoteText')

    if (!picturesTab || !content || !gridWrap || !grid || !detail || !detailCard || !detailImage || !backBtn || !nextBtn || !closeBtn || !fullscreenBtn || !fullscreenCloseBtn || !stage || !counter) return

    function getFallbackPictureLibrary() {
        const message = getPicturesFallbackMessage()

        return {
            albums: [
                {
                    id: 'pictures-fallback',
                    title: message,
                    description: message,
                    images: ['images/empty.png']
                }
            ]
        }
    }

    function normalizeImageList(item) {
        const rawImages = Array.isArray(item.images)
            ? item.images
            : Array.isArray(item.pictures)
                ? item.pictures
                : Array.isArray(item.files)
                    ? item.files
                    : item.image
                        ? [item.image]
                        : []

        return rawImages.filter(function(image) {
            return typeof image === 'string' && image.trim().length > 0
        }).map(function(image) {
            const normalized = String(image).replace(/\\/g, '/')

            if (/^photography\/post\d+\//i.test(normalized)) {
                return normalized.replace(/^photography\//i, 'photography/posts/')
            }

            return normalized
        })
    }

    function normalizeAlbum(item, index) {
        const images = normalizeImageList(item)
        const title = String(item.title || item.name || 'Untitled picture')

        return {
            id: String(item.id || 'picture-' + index),
            title: title,
            description: String(item.description || item.summary || ''),
            images: images.length ? images : ['images/empty.png'],
            cover: String(item.cover || images[0] || 'images/empty.png'),
            alt: String(item.alt || title),
            badge: item.badge === undefined ? (images.length > 1 ? '?' : '') : String(item.badge)
        }
    }

    async function loadPictureLibrary() {
        try {
            const response = await fetch('photography/photography.json', { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load photography library')

            const json = await response.json()
            const sourceAlbums = Array.isArray(json.albums)
                ? json.albums
                : Array.isArray(json.items)
                    ? json.items
                    : Array.isArray(json.pictures)
                        ? json.pictures
                        : []

            if (!sourceAlbums.length) throw new Error('No photography found')
            return sourceAlbums.map(normalizeAlbum)
        } catch (error) {
            console.warn('Using fallback picture library:', error)
            return getFallbackPictureLibrary().albums.map(normalizeAlbum)
        }
    }

    let albums = []
    let activeAlbumIndex = -1
    let activeImageIndex = 0
    let touchStartX = 0
    let touchTracking = false
    let stageHomeParent = null
    let stageHomeNextSibling = null

    let isHoveringInfo = false
    let isHoveringNote = false
    let noteCloseTimeout = null

    function hasAlbumDescription(album) {
        return Boolean(album && typeof album.description === 'string' && album.description.trim().length > 0)
    }

    function buildHoverNoteText(album) {
        if (!album) return 'Open a picture to see details.'

        const lines = [album.title]
        if (album.description) lines.push(album.description)
        return lines.join('\n')
    }

    function setInfoOpen(isOpen) {
        if (!hoverNote) return

        if (isOpen && !hasAlbumDescription(albums[activeAlbumIndex])) {
            isOpen = false
        }

        picturesTab.classList.toggle('is-info-open', isOpen)
        hoverNote.setAttribute('aria-hidden', isOpen ? 'false' : 'true')

        if (isOpen && hoverNoteText) {
            hoverNoteText.textContent = buildHoverNoteText(albums[activeAlbumIndex])
        }
    }

    function syncInfoVisibility() {
        if (!infoText) return

        const shouldShow = hasAlbumDescription(albums[activeAlbumIndex]) && !stage.classList.contains('is-expanded')
        infoText.style.display = shouldShow ? 'inline-flex' : 'none'

        if (!shouldShow) {
            setInfoOpen(false)
        }
    }

    function scheduleInfoClose() {
        if (noteCloseTimeout) window.clearTimeout(noteCloseTimeout)
        noteCloseTimeout = window.setTimeout(function() {
            if (isHoveringInfo || isHoveringNote) return
            setInfoOpen(false)
        }, 60)
    }

    function mountStageToBody() {
        if (stage.parentElement === document.body) return

        stageHomeParent = stage.parentElement
        stageHomeNextSibling = stage.nextElementSibling
        document.body.appendChild(stage)
    }

    function restoreStageHome() {
        if (!stageHomeParent) return

        if (stageHomeNextSibling && stageHomeNextSibling.parentElement === stageHomeParent) {
            stageHomeParent.insertBefore(stage, stageHomeNextSibling)
        } else {
            stageHomeParent.appendChild(stage)
        }
    }

    function setExpandedStage(isExpanded) {
        if (isExpanded) {
            if (getComputedStyle(picturesTab).display === 'none') return
            mountStageToBody()
            stage.classList.add('is-expanded')
            document.body.classList.add('pictures-expanded')
        } else {
            stage.classList.remove('is-expanded')
            document.body.classList.remove('pictures-expanded')
            restoreStageHome()
        }

        fullscreenBtn.style.display = isExpanded ? 'none' : 'inline-flex'
        fullscreenCloseBtn.style.display = isExpanded ? 'inline-flex' : 'none'
        closeBtn.style.display = isExpanded ? 'none' : 'inline-flex'
        syncInfoVisibility()
    }

    function setDetailOpen(isOpen) {
        content.classList.toggle('is-detail-open', isOpen)
        gridWrap.setAttribute('aria-hidden', isOpen ? 'true' : 'false')
        detail.setAttribute('aria-hidden', isOpen ? 'false' : 'true')
        detailCard.setAttribute('aria-hidden', isOpen ? 'false' : 'true')

        if (!isOpen) {
            const tiles = grid.querySelectorAll('.picture-tile')
            tiles.forEach(function(tile) {
                tile.classList.remove('is-active')
            })
        }
    }

    function setActiveTile(albumIndex) {
        const tiles = grid.querySelectorAll('.picture-tile')
        tiles.forEach(function(tile) {
            tile.classList.toggle('is-active', Number(tile.dataset.albumIndex) === albumIndex)
        })
    }

    function renderActiveImage() {
        const album = albums[activeAlbumIndex]
        if (!album) return

        const imageSource = album.images[activeImageIndex] || album.cover
        detailImage.src = imageSource
        detailImage.alt = album.alt + ' ' + (activeImageIndex + 1)
        detailImage.classList.remove('is-landscape-rotated')
        if (detailTitle) detailTitle.textContent = album.title
        if (detailDescription) detailDescription.textContent = album.description || ''
        counter.textContent = (activeImageIndex + 1) + ' / ' + album.images.length
        backBtn.style.display = activeImageIndex > 0 ? 'inline-flex' : 'none'
        nextBtn.style.display = activeImageIndex < album.images.length - 1 ? 'inline-flex' : 'none'
        nextBtn.disabled = false
        nextBtn.classList.remove('is-disabled')

        syncInfoVisibility()

        if (hoverNoteText && hasAlbumDescription(album)) {
            hoverNoteText.textContent = buildHoverNoteText(album)
        }
    }

    detailImage.addEventListener('load', function() {
        const isLandscape = detailImage.naturalWidth > detailImage.naturalHeight
        detailImage.classList.toggle('is-landscape-rotated', Boolean(isLandscape))
    })

    function openAlbum(albumIndex, imageIndex) {
        const album = albums[albumIndex]
        if (!album) return

        activeAlbumIndex = albumIndex
        activeImageIndex = Math.max(0, Math.min(imageIndex || 0, album.images.length - 1))
        setDetailOpen(true)
        setActiveTile(albumIndex)
        renderActiveImage()
    }

    function closeAlbum() {
        activeAlbumIndex = -1
        activeImageIndex = 0
        setInfoOpen(false)
        syncInfoVisibility()
        setExpandedStage(false)
        setDetailOpen(false)
    }

    function showNextImage() {
        const album = albums[activeAlbumIndex]
        if (!album || activeImageIndex >= album.images.length - 1) return
        activeImageIndex += 1
        renderActiveImage()
    }

    function showPreviousImage() {
        if (activeImageIndex <= 0) return
        activeImageIndex -= 1
        renderActiveImage()
    }

    function renderGallery() {
        grid.innerHTML = ''

        if (!albums.length) {
            const empty = document.createElement('p')
            empty.className = 'pictures-empty'
            empty.textContent = getPicturesFallbackMessage()
            grid.appendChild(empty)
            setDetailOpen(false)
            return
        }

        albums.forEach(function(album, index) {
            const tile = document.createElement('button')
            tile.type = 'button'
            tile.className = 'picture-tile'
            tile.dataset.albumIndex = String(index)
            tile.style.backgroundImage = 'url("' + album.cover + '")'
            tile.setAttribute('aria-label', album.title + (album.images.length > 1 ? ', album' : ', picture'))

            if (album.images.length > 1) {
                tile.classList.add('picture-tile--album')
            }

            tile.addEventListener('click', function() {
                openAlbum(index, 0)
            })

            grid.appendChild(tile)
        })
    }

    backBtn.addEventListener('click', function() {
        showPreviousImage()
    })

    nextBtn.addEventListener('click', function() {
        showNextImage()
    })

    closeBtn.addEventListener('click', function() {
        closeAlbum()
    })

    fullscreenBtn.addEventListener('click', function() {
        setExpandedStage(true)
    })

    fullscreenCloseBtn.addEventListener('click', function() {
        setExpandedStage(false)
    })

    if (infoText && hoverNote) {
        infoText.addEventListener('mouseenter', function() {
            isHoveringInfo = true
            setInfoOpen(true)
        })

        infoText.addEventListener('mouseleave', function() {
            isHoveringInfo = false
            scheduleInfoClose()
        })

        hoverNote.addEventListener('mouseenter', function() {
            isHoveringNote = true
            setInfoOpen(true)
        })

        hoverNote.addEventListener('mouseleave', function() {
            isHoveringNote = false
            scheduleInfoClose()
        })
    }

    syncInfoVisibility()

    stage.addEventListener('touchstart', function(event) {
        if (!event.changedTouches || !event.changedTouches.length) return
        touchStartX = event.changedTouches[0].clientX
        touchTracking = true
    }, { passive: true })

    stage.addEventListener('touchend', function(event) {
        if (!touchTracking || !event.changedTouches || !event.changedTouches.length) return

        const endX = event.changedTouches[0].clientX
        const deltaX = endX - touchStartX

        touchTracking = false

        if (Math.abs(deltaX) < 40) return

        if (deltaX < 0) {
            showNextImage()
        } else {
            showPreviousImage()
        }
    }, { passive: true })

    stage.addEventListener('touchcancel', function() {
        touchTracking = false
    }, { passive: true })

    document.addEventListener('keydown', function(event) {
        if (event.key !== 'Escape') return
        if (!stage.classList.contains('is-expanded')) return
        setExpandedStage(false)
    })

    document.addEventListener('click', function(event) {
        if (!stage.classList.contains('is-expanded')) return

        const taskbarWindowBtn = event.target && event.target.closest
            ? event.target.closest('.taskbar-window-btn')
            : null
        if (!taskbarWindowBtn) return

        if (taskbarWindowBtn.dataset.tabId !== 'picturesTab') {
            setExpandedStage(false)
        }
    }, true)

    const picturesVisibilityObserver = new MutationObserver(function() {
        if (!stage.classList.contains('is-expanded')) return
        if (getComputedStyle(picturesTab).display !== 'none') return
        setExpandedStage(false)
    })
    picturesVisibilityObserver.observe(picturesTab, { attributes: true, attributeFilter: ['style', 'class'] })

    albums = await loadPictureLibrary()
    renderGallery()
    setDetailOpen(false)
    setExpandedStage(false)
}