function getMusicFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || "data couldn't be found - working on it..."
}

async function initMusicPlayer() {
    const songsLibrary = document.getElementById('songsLibrary')

    function cleanYouTubeArtist(artist) {
        return String(artist || '').replace(/\s*-\s*topic\s*$/i, '').trim() || String(artist || '').trim()
    }

    function normalizeTrackLookupKey(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '')
    }

    function flattenFetchedTracks(fetchedJson) {
        const sections = Array.isArray(fetchedJson && fetchedJson.sections) ? fetchedJson.sections : []
        const tracks = []
        sections.forEach(function(section) {
            const sectionTracks = Array.isArray(section && section.tracks) ? section.tracks : []
            tracks.push.apply(tracks, sectionTracks)
        })
        return tracks
    }

    function buildYoutubeTrackIndex(fetchedTracks) {
        const byArtistTitle = new Map()
        const byTitle = new Map()

        fetchedTracks.forEach(function(track) {
            if (!track || !track.youtubeUrl) return

            const titleKey = normalizeTrackLookupKey(track.title)
            const artistKey = normalizeTrackLookupKey(cleanYouTubeArtist(track.artist))
            if (!titleKey) return

            if (artistKey) {
                byArtistTitle.set(artistKey + '||' + titleKey, track)
            }

            const titleMatches = byTitle.get(titleKey) || []
            titleMatches.push(track)
            byTitle.set(titleKey, titleMatches)
        })

        return { byArtistTitle, byTitle }
    }

    function findYoutubeMatch(track, youtubeTrackIndex) {
        if (!track || !youtubeTrackIndex) return null

        const titleKey = normalizeTrackLookupKey(track.title)
        const artistKey = normalizeTrackLookupKey(track.artist)
        if (!titleKey) return null

        if (artistKey) {
            const exactMatch = youtubeTrackIndex.byArtistTitle.get(artistKey + '||' + titleKey)
            if (exactMatch) return exactMatch
        }

        const titleMatches = youtubeTrackIndex.byTitle.get(titleKey) || []
        return titleMatches.length === 1 ? titleMatches[0] : null
    }
    function getFallbackMusicLibrary() {
        return {
            sections: []
        }
    }

    async function loadMusicLibrary() {
        try {
            const response = await fetch('music/songs-library.json', { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load music library')

            const json = await response.json()
            if (!json || !Array.isArray(json.sections)) throw new Error('Invalid music library format')
            return json
        } catch (error) {
            console.warn('Using fallback music library:', error)
            return getFallbackMusicLibrary()
        }
    }

    async function loadGenreLibrary() {
        try {
            const response = await fetch('music/genre-library.json', { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load genre library')

            const json = await response.json()
            if (!json || !Array.isArray(json.genres)) throw new Error('Invalid genre library format')
            return json
        } catch (error) {
            console.warn('Using fallback genre library:', error)
            return { genres: [] }
        }
    }

    async function loadFetchedYoutubeLibrary() {
        try {
            const response = await fetch('music/fetched-songs-ytb-api.json', { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load fetched YouTube library')

            return await response.json()
        } catch (error) {
            console.warn('YouTube link metadata unavailable:', error)
            return null
        }
    }

    function attachYoutubeUrlsToLibrary(libraryData, fetchedYoutubeLibrary) {
        const youtubeTrackIndex = buildYoutubeTrackIndex(flattenFetchedTracks(fetchedYoutubeLibrary))
        const sections = Array.isArray(libraryData && libraryData.sections) ? libraryData.sections : []

        sections.forEach(function(section) {
            const tracks = Array.isArray(section && section.tracks) ? section.tracks : []
            tracks.forEach(function(track) {
                if (!track || track.youtubeUrl) return
                const youtubeMatch = findYoutubeMatch(track, youtubeTrackIndex)
                if (!youtubeMatch) return

                track.youtubeUrl = String(youtubeMatch.youtubeUrl || '')
                if (youtubeMatch.youtubeVideoId && !track.youtubeVideoId) {
                    track.youtubeVideoId = String(youtubeMatch.youtubeVideoId)
                }
            })
        })

        return libraryData
    }

    function buildGenrePaletteMap(genreLibrary) {
        const paletteMap = {}
        const genres = Array.isArray(genreLibrary && genreLibrary.genres) ? genreLibrary.genres : []

        genres.forEach(function(entry) {
            if (!entry || !entry.genre) return
            paletteMap[String(entry.genre).toLowerCase()] = {
                primary: entry.primary || '#666666',
                secondary: entry.secondary || entry.primary || '#999999',
                accent: entry.accent || '#cccccc',
                text: entry.text || '#ffffff'
            }
        })

        return paletteMap
    }

    function getGenrePalette(genre, genrePaletteMap) {
        return genrePaletteMap[String(genre || 'Genre TBD').toLowerCase()] || {
            primary: '#666666',
            secondary: '#999999',
            accent: '#cccccc',
            text: '#ffffff'
        }
    }

    function normalizeTrackPath(filePath) {
        const raw = String(filePath || '').trim()
        if (!raw) return raw

        if (/^music\/(?!songs\/)/i.test(raw)) {
            return raw.replace(/^music\//i, 'music/songs/')
        }

        return raw
    }

    function renderMusicLibrary(libraryData, genrePaletteMap) {
        if (!songsLibrary) return
        songsLibrary.innerHTML = ''

        const sections = Array.isArray(libraryData && libraryData.sections) ? libraryData.sections : []
        const hasTracks = sections.some(function(section) {
            const tracks = Array.isArray(section && section.tracks) ? section.tracks : []
            return tracks.some(function(track) {
                return Boolean(track && track.file)
            })
        })

        if (!hasTracks) {
            const emptyState = document.createElement('button')
            emptyState.className = 'song-btn'
            emptyState.type = 'button'
            emptyState.textContent = getMusicFallbackMessage()
            emptyState.disabled = true
            songsLibrary.appendChild(emptyState)
            return
        }

        sections.forEach(function(section) {
            const heading = document.createElement('h2')
            heading.textContent = section.title || 'UNTITLED SECTION'
            songsLibrary.appendChild(heading)

            const tracks = Array.isArray(section.tracks) ? section.tracks : []
            const isTopRankedSection = normalizeTrackLookupKey(section.title) === normalizeTrackLookupKey('MY TOP SONGS ATM')
            const filteredTracks = tracks
                .filter(function(track) {
                    return Boolean(track && track.file)
                })
                .slice()

            const sortedTracks = isTopRankedSection
                ? filteredTracks
                : filteredTracks.sort(function(first, second) {
                    const firstArtist = (first.artist || 'Artist TBD').toLowerCase()
                    const secondArtist = (second.artist || 'Artist TBD').toLowerCase()
                    const artistOrder = firstArtist.localeCompare(secondArtist)
                    if (artistOrder !== 0) return artistOrder

                    const firstGenre = (first.genre || 'Genre TBD').toLowerCase()
                    const secondGenre = (second.genre || 'Genre TBD').toLowerCase()
                    const genreOrder = firstGenre.localeCompare(secondGenre)
                    if (genreOrder !== 0) return genreOrder

                    const firstTitle = (first.title || 'Untitled').toLowerCase()
                    const secondTitle = (second.title || 'Untitled').toLowerCase()
                    return firstTitle.localeCompare(secondTitle)
                })

            if (!sortedTracks.length) {
                const emptyState = document.createElement('button')
                emptyState.className = 'song-btn'
                emptyState.type = 'button'
                emptyState.textContent = '-'
                emptyState.disabled = true
                songsLibrary.appendChild(emptyState)
                return
            }

            sortedTracks.forEach(function(track, index) {
                if (!track || !track.file) return
                const normalizedTrackFile = normalizeTrackPath(track.file)

                const button = document.createElement('button')
                button.className = 'song-btn'
                button.type = 'button'

                const title = track.title || 'Untitled'
                const artist = track.artist || 'Artist TBD'
                const genre = track.genre || 'Genre TBD'
                const metaSpan = document.createElement('span')
                metaSpan.className = 'song-btn-meta'
                if (isTopRankedSection) {
                    const rankLabel = typeof window.toRoman === 'function' ? window.toRoman(index + 1) : String(index + 1)
                    metaSpan.textContent = rankLabel + '.  ' + artist + ' - ' + title
                } else {
                    metaSpan.textContent = artist + ' - ' + title
                }

                const genreSpan = document.createElement('span')
                genreSpan.className = 'song-btn-genre'
                genreSpan.textContent = genre

                const genrePalette = getGenrePalette(genre, genrePaletteMap)
                genreSpan.style.setProperty('--genre-primary', genrePalette.primary)
                genreSpan.style.setProperty('--genre-secondary', genrePalette.secondary)
                genreSpan.style.setProperty('--genre-accent', genrePalette.accent)
                genreSpan.style.setProperty('--genre-text', genrePalette.text)
                button.style.setProperty('--genre-primary', genrePalette.primary)
                button.style.setProperty('--genre-secondary', genrePalette.secondary)
                button.style.setProperty('--genre-accent', genrePalette.accent)
                button.style.setProperty('--genre-text', genrePalette.text)

                button.appendChild(metaSpan)
                button.appendChild(genreSpan)

                button.dataset.song = normalizedTrackFile
                button.dataset.trackId = track.id || (section.title + '-' + index)
                button.dataset.title = title
                button.dataset.artist = artist
                button.dataset.genre = genre
                button.dataset.youtubeUrl = track.youtubeUrl || ''

                songsLibrary.appendChild(button)
            })
        })
    }

    const [loadedLibrary, loadedGenreLibrary, fetchedYoutubeLibrary] = await Promise.all([
        loadMusicLibrary(),
        loadGenreLibrary(),
        loadFetchedYoutubeLibrary()
    ])
    const musicLibrary = attachYoutubeUrlsToLibrary(loadedLibrary, fetchedYoutubeLibrary)
    const genrePaletteMap = buildGenrePaletteMap(loadedGenreLibrary)
    renderMusicLibrary(musicLibrary, genrePaletteMap)
    
    // Genre filtering setup
    function initGenreFilter() {
        const genreFilterRow = document.getElementById('genreFilterRow')
        if (!genreFilterRow) return

        genreFilterRow.addEventListener('wheel', function(event) {
            const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
            if (!horizontalDelta) return

            event.preventDefault()
            genreFilterRow.scrollLeft += horizontalDelta
        }, { passive: false })

        // Style the "All" button with a default/neutral palette
        const allBtn = genreFilterRow.querySelector('[data-genre="all"]')
        if (allBtn) {
            const neutralPalette = {
                primary: '#4a7c7e',
                secondary: '#2d5a5c',
                accent: '#7fb3b5',
                text: '#ffffff'
            }
            allBtn.style.setProperty('--genre-primary', neutralPalette.primary)
            allBtn.style.setProperty('--genre-secondary', neutralPalette.secondary)
            allBtn.style.setProperty('--genre-accent', neutralPalette.accent)
            allBtn.style.setProperty('--genre-text', neutralPalette.text)
            allBtn.classList.add('active-genre')
        }

        const genres = Array.isArray(loadedGenreLibrary && loadedGenreLibrary.genres) ? loadedGenreLibrary.genres : []
        
        // Collect unique genres from songs
        const uniqueGenres = new Set()
        document.querySelectorAll('.songs-lib .song-btn[data-genre]').forEach(function(btn) {
            const genre = btn.dataset.genre
            if (genre && genre !== 'Genre TBD') {
                uniqueGenres.add(genre)
            }
        })
        
        // Sort genres alphabetically
        const sortedGenres = Array.from(uniqueGenres).sort()
        
        // Create genre buttons
        sortedGenres.forEach(function(genre) {
            const btn = document.createElement('button')
            btn.className = 'genre-btn'
            btn.type = 'button'
            btn.dataset.genre = genre
            btn.textContent = genre
            
            // Find genre palette from library
            const genrePalette = getGenrePalette(genre, genrePaletteMap)
            btn.style.setProperty('--genre-primary', genrePalette.primary)
            btn.style.setProperty('--genre-secondary', genrePalette.secondary)
            btn.style.setProperty('--genre-accent', genrePalette.accent)
            btn.style.setProperty('--genre-text', genrePalette.text)
            
            btn.addEventListener('click', function() {
                filterByGenre(genre)
            })
            
            genreFilterRow.appendChild(btn)
        })

        updateFirstVisibleSectionHeading()
    }

    function updateFirstVisibleSectionHeading() {
        const headings = Array.from(document.querySelectorAll('.songs-lib h2'))
        let hasMarkedHeading = false

        headings.forEach(function(heading) {
            const isVisible = heading.style.display !== 'none'
            const shouldMarkHeading = !hasMarkedHeading && isVisible

            heading.classList.toggle('is-first-visible-heading', shouldMarkHeading)

            if (shouldMarkHeading) {
                hasMarkedHeading = true
            }
        })
    }
    
    function filterByGenre(selectedGenre) {
        const songBtns = Array.from(document.querySelectorAll('.songs-lib .song-btn[data-genre]'))
        const genreBtns = Array.from(document.querySelectorAll('.genre-filter-row .genre-btn'))
        
        // Update active state of genre buttons
        genreBtns.forEach(function(btn) {
            if (btn.dataset.genre === selectedGenre) {
                btn.classList.add('active-genre')
            } else {
                btn.classList.remove('active-genre')
            }
        })
        
        // Filter songs
        songBtns.forEach(function(btn) {
            if (btn.dataset.genre === selectedGenre) {
                btn.style.display = ''
            } else {
                btn.style.display = 'none'
            }
        })
        
        // Hide section headings with no visible songs
        const headings = Array.from(document.querySelectorAll('.songs-lib h2'))
        headings.forEach(function(heading) {
            let nextElement = heading.nextElementSibling
            let hasVisibleSongs = false
            
            while (nextElement && nextElement.tagName !== 'H2') {
                if (nextElement.classList.contains('song-btn') && nextElement.style.display !== 'none') {
                    hasVisibleSongs = true
                    break
                }
                nextElement = nextElement.nextElementSibling
            }
            
            heading.style.display = hasVisibleSongs ? '' : 'none'
        })

        updateFirstVisibleSectionHeading()
        
        // Rebuild playlist for player
        rebuildPlaylist()
    }
    
    function filterByGenreAll() {
        const songBtns = Array.from(document.querySelectorAll('.songs-lib .song-btn[data-genre]'))
        const genreBtns = Array.from(document.querySelectorAll('.genre-filter-row .genre-btn'))
        
        // Update active state of genre buttons
        genreBtns.forEach(function(btn) {
            if (btn.dataset.genre === 'all') {
                btn.classList.add('active-genre')
            } else {
                btn.classList.remove('active-genre')
            }
        })
        
        // Show all songs and headings
        songBtns.forEach(function(btn) {
            btn.style.display = ''
        })
        
        const headings = Array.from(document.querySelectorAll('.songs-lib h2'))
        headings.forEach(function(heading) {
            heading.style.display = ''
        })

        updateFirstVisibleSectionHeading()
        
        // Rebuild playlist for player
        rebuildPlaylist()
    }
    
    // Add event listener to "All" button
    const allGenreBtn = document.querySelector('.genre-filter-row .genre-btn[data-genre="all"]')
    if (allGenreBtn) {
        allGenreBtn.addEventListener('click', filterByGenreAll)
    }
    
    initGenreFilter()
    let buttons = Array.from(document.querySelectorAll('.songs-lib .song-btn[data-song]'))

    const canvas = document.getElementById('visualizer')

    const audio = document.getElementById('audio')

    const backBtn = document.getElementById('backBtn')
    const playPauseBtn = document.getElementById('playPauseBtn')
    const nextBtn = document.getElementById('nextBtn')
    const shuffleBtn = document.getElementById('shuffleBtn')
    const youtubeBtn = document.getElementById('youtubeBtn')
    const nowPlaying = document.getElementById('nowPlaying')
    const nowPlayingText = document.getElementById('nowPlayingText')
    const playlistInfo = document.getElementById('playlistInfo')
    const vizEmptyState = document.getElementById('vizEmptyState')
    const seekBar = document.getElementById('seekBar')
    const currentTimeLabel = document.getElementById('currentTime')
    const durationLabel = document.getElementById('duration')
    const musicTab = document.getElementById('musicTab')
    const musicCloseBtn = document.getElementById('exitbtnMusic')

    const miniPlayerTab = document.getElementById('miniPlayerTab')
    const miniCloseBtn = document.getElementById('exitbtnMiniPlayer')
    const miniBackBtn = document.getElementById('miniBackBtn')
    const miniPlayPauseBtn = document.getElementById('miniPlayPauseBtn')
    const miniNextBtn = document.getElementById('miniNextBtn')
    const miniShuffleBtn = document.getElementById('miniShuffleBtn')
    const miniNowPlayingText = document.getElementById('miniNowPlayingText')
    const miniPlaylistInfo = document.getElementById('miniPlaylistInfo')
    const miniSeekBar = document.getElementById('miniSeekBar')
    const miniCurrentTimeLabel = document.getElementById('miniCurrentTime')
    const miniDurationLabel = document.getElementById('miniDuration')

    const vizType = document.getElementById('typeViz')
    const color1Input = document.getElementById('colorPicker1')
    const color2Input = document.getElementById('colorPicker2')
    const color3Input = document.getElementById('colorPicker3')
    const color4Input = document.getElementById('colorPicker4')
    const color5Input = document.getElementById('colorPicker5')
    const randomVizBtn = document.getElementById('randomVizBtn')
    const rainbowVizToggle = document.getElementById('rainbowViz')
    const vizVolumeControl = document.querySelector('.viz-setting-group--volume')

    let audioCtx, analyser, leftAnalyser, rightAnalyser, channelSplitter, audioSource
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        analyser = audioCtx.createAnalyser()
        leftAnalyser = audioCtx.createAnalyser()
        rightAnalyser = audioCtx.createAnalyser()
        channelSplitter = audioCtx.createChannelSplitter(2)
        audioSource = audioCtx.createMediaElementSource(audio)
    } catch (error) {
        console.error('Audio context initialization failed:', error)
        // Graceful degradation: visualizer won't work but player will function
        return
    }

    audioSource.connect(analyser)
    audioSource.connect(channelSplitter)
    channelSplitter.connect(leftAnalyser, 0)
    channelSplitter.connect(rightAnalyser, 1)
    analyser.connect(audioCtx.destination)
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.48
    leftAnalyser.fftSize = 1024
    leftAnalyser.smoothingTimeConstant = 0.48
    rightAnalyser.fftSize = 1024
    rightAnalyser.smoothingTimeConstant = 0.48

    let currentTrackIndex = -1
    let isShuffle = false

    function createTrackFromButton(button, index) {
        if (!button) return null

        const trackTitle = button.dataset.title || button.textContent.trim()
        const trackArtist = button.dataset.artist || ''
        const trackGenre = button.dataset.genre || 'Genre TBD'

        return {
            id: button.dataset.trackId || '',
            index: Number.isFinite(index) ? index : -1,
            button: button,
            path: button.dataset.song,
            title: trackTitle,
            artist: trackArtist,
            genre: trackGenre,
            youtubeUrl: button.dataset.youtubeUrl || ''
        }
    }

    let playlist = buttons.map(function(button, index) {
        return createTrackFromButton(button, index)
    }).filter(function(song) {
        return Boolean(song && song.path)
    })
    
    function rebuildPlaylist() {
        const currentSrc = String(audio && audio.src ? audio.src : '')
        const visibleButtons = Array.from(document.querySelectorAll('.songs-lib .song-btn[data-song]:not([style*="display: none"])'))

        playlist = visibleButtons.map(function(button, index) {
            return createTrackFromButton(button, index)
        }).filter(function(song) {
            return Boolean(song && song.path)
        })

        // Keep the current track index in sync with the *visible* playlist.
        // If the current song isn't part of the selected genre, we show 0 / N.
        let nextIndex = -1
        if (currentSrc) {
            nextIndex = playlist.findIndex(function(track) {
                try {
                    return new URL(track.path, window.location.href).href === currentSrc
                } catch (e) {
                    return false
                }
            })
        }
        currentTrackIndex = nextIndex

        updatePlaylistInfo()
        updateActiveSongButton()
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return mins + ':' + String(secs).padStart(2, '0')
    }

    function isMusicTabVisible() {
        return Boolean(musicTab) && getComputedStyle(musicTab).display !== 'none'
    }

    function isAudioPlaying() {
        return Boolean(audio.src) && !audio.paused && !audio.ended
    }

    const visualizerController = window.createVisualizerController({
        analyser: analyser,
        leftAnalyser: leftAnalyser,
        rightAnalyser: rightAnalyser,
        canvas: canvas,
        vizType: vizType,
        colorInputs: [color1Input, color2Input, color3Input, color4Input, color5Input],
        randomButton: randomVizBtn,
        rainbowToggle: rainbowVizToggle,
        isAudioPlaying: isAudioPlaying,
        isMusicTabVisible: isMusicTabVisible
    })

    if (vizVolumeControl && typeof window.openGlobalVolumePopup === 'function') {
        vizVolumeControl.addEventListener('click', function(event) {
            event.preventDefault()
            event.stopPropagation()
            window.openGlobalVolumePopup()
        })
    }

    function pushVisualizerSettings() {
        if (!visualizerController) return
        visualizerController.pushSettings()
        updateVisualizerEmptyState()
    }

    function syncVisualizerAnimation() {
        if (!visualizerController) return
        visualizerController.sync()
    }

    function resetVisualizerState() {
        if (!visualizerController) return
        visualizerController.reset()
    }

    let visualizerPrimeScheduled = false

    function scheduleVisualizerPrime() {
        if (visualizerPrimeScheduled) return
        if (!canvas || !window.threeVisualizer || typeof window.threeVisualizer.prime !== 'function') return

        visualizerPrimeScheduled = true

        const prime = function() {
            Promise.resolve(window.threeVisualizer.prime(canvas)).catch(function(error) {
                console.warn('Visualizer prime failed:', error)
            })
        }

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(prime, { timeout: 1200 })
            return
        }

        window.setTimeout(prime, 0)
    }

    function hasLoadedTrack() {
        return Boolean(audio.src)
    }

    function updateVisualizerEmptyState() {
        if (!vizEmptyState) return

        const selectedType = vizType ? String(vizType.value || 'v1') : 'v1'
        const isWorkInProgressType = selectedType === 'v2'
        const shouldShowEmptyState = isWorkInProgressType || !hasLoadedTrack()

        vizEmptyState.textContent = isWorkInProgressType
            ? 'working on implementing more visualiser types! ;p'
            : 'nothing is playing'
        vizEmptyState.classList.toggle('is-hidden', !shouldShowEmptyState)
        vizEmptyState.setAttribute('aria-hidden', shouldShowEmptyState ? 'false' : 'true')
    }

    if (vizType) {
        vizType.addEventListener('input', updateVisualizerEmptyState)
        vizType.addEventListener('change', updateVisualizerEmptyState)
    }

    function bringMiniPlayerToFront() {
        if (!miniPlayerTab) return
        miniPlayerTab.style.zIndex = '2147483647'
    }

    function placeMiniPlayerBottomRight() {
        if (!miniPlayerTab || miniPlayerTab.dataset.positioned === 'true') return

        const taskbar = document.querySelector('.taskbar')
        const taskbarHeight = taskbar ? taskbar.offsetHeight : 0
        const left = Math.max(8, window.innerWidth - miniPlayerTab.offsetWidth - 12)
        const top = Math.max(8, window.innerHeight - taskbarHeight - miniPlayerTab.offsetHeight - 12)

        miniPlayerTab.style.left = left + 'px'
        miniPlayerTab.style.top = top + 'px'
        miniPlayerTab.dataset.positioned = 'true'
    }

    function showMiniPlayer() {
        if (!miniPlayerTab) return
        miniPlayerTab.style.display = 'block'
        miniPlayerTab.style.zIndex = '2147483647'
        placeMiniPlayerBottomRight()
    }

    function hideMiniPlayer() {
        if (!miniPlayerTab) return
        miniPlayerTab.style.display = 'none'
    }

    function syncMiniPlayerVisibility() {
        if (!miniPlayerTab) return
        if (hasLoadedTrack() && !isMusicTabVisible()) {
            showMiniPlayer()
        } else {
            hideMiniPlayer()
        }
        syncVisualizerAnimation()
    }


    function getNowPlayingAvailableWidth() {
        const playlistInfoContainer = nowPlaying.querySelector('.playlist-info-container')
        if (!playlistInfoContainer) return nowPlaying.clientWidth

        const nowRect = nowPlaying.getBoundingClientRect()
        const playlistRect = playlistInfoContainer.getBoundingClientRect()

        // The user-visible cutoff is the *start* (left edge) of the playlist info container.
        const width = Math.floor(playlistRect.left - nowRect.left)
        return Math.max(0, Math.min(width, nowPlaying.clientWidth))
    }

    function measureMarqueeTextWidth(textElement, title, measureHost) {
        if (!textElement) return 0

        const measureEl = document.createElement('span')
        measureEl.className = textElement.className.replace(/\bmarquee\b/g, '').replace(/\s+/g, ' ').trim()
        measureEl.textContent = title
        measureEl.style.position = 'absolute'
        measureEl.style.left = '-99999px'
        measureEl.style.top = '-99999px'
        measureEl.style.visibility = 'hidden'
        measureEl.style.whiteSpace = 'nowrap'
        measureEl.style.pointerEvents = 'none'
        measureEl.style.maxWidth = 'none'
        measureEl.style.width = 'auto'
        measureEl.style.overflow = 'visible'
        measureEl.style.textOverflow = 'clip'

        const host = measureHost || textElement.parentElement || document.body
        host.appendChild(measureEl)
        const width = measureEl.scrollWidth
        host.removeChild(measureEl)
        return width
    }

    function cancelOverflowTitleFrames(textElement) {
        if (!textElement) return

        if (textElement._overflowTitleFrameId) {
            cancelAnimationFrame(textElement._overflowTitleFrameId)
            textElement._overflowTitleFrameId = 0
        }

        if (textElement._overflowMarqueeFrameId) {
            cancelAnimationFrame(textElement._overflowMarqueeFrameId)
            textElement._overflowMarqueeFrameId = 0
        }
    }

    function nextOverflowTitleToken(textElement) {
        const nextToken = Number(textElement && textElement._overflowTitleToken ? textElement._overflowTitleToken : 0) + 1
        if (textElement) {
            textElement._overflowTitleToken = nextToken
        }
        return nextToken
    }

    function isOverflowTitleTokenCurrent(textElement, token) {
        return Boolean(textElement) && Number(textElement._overflowTitleToken || 0) === Number(token)
    }

    function disableOverflowMarquee(textElement, displayTitle) {
        if (!textElement) return

        cancelOverflowTitleFrames(textElement)
        textElement.classList.remove('marquee')
        textElement.style.removeProperty('--marquee-gap')
        textElement.style.removeProperty('--marquee-shift')
        textElement.style.removeProperty('--marquee-duration')
        textElement.innerHTML = ''
        textElement.textContent = displayTitle
    }

    function enableOverflowMarquee(textElement, displayTitle, token) {
        if (!textElement) return
        if (!isOverflowTitleTokenCurrent(textElement, token)) return

        const marqueeGap = 24
        const pixelsPerSecond = 35

        textElement.innerHTML = ''
        const track = document.createElement('span')
        track.className = 'marquee-track'

        const seg1 = document.createElement('span')
        seg1.className = 'marquee-segment'
        seg1.textContent = displayTitle

        const seg2 = document.createElement('span')
        seg2.className = 'marquee-segment is-clone'
        seg2.textContent = displayTitle
        seg2.setAttribute('aria-hidden', 'true')

        track.appendChild(seg1)
        track.appendChild(seg2)
        textElement.appendChild(track)
        textElement.classList.add('marquee')
        textElement.style.setProperty('--marquee-gap', marqueeGap + 'px')

        textElement._overflowMarqueeFrameId = requestAnimationFrame(function() {
            textElement._overflowMarqueeFrameId = 0
            if (!isOverflowTitleTokenCurrent(textElement, token)) return

            const segWidth = Math.ceil(seg1.getBoundingClientRect().width)
            const shift = Math.max(0, segWidth + marqueeGap)
            const duration = Math.min(25, Math.max(8, shift / pixelsPerSecond))

            textElement.style.setProperty('--marquee-shift', shift + 'px')
            textElement.style.setProperty('--marquee-duration', duration + 's')
        })
    }

    function setOverflowTitle(textElement, title, options) {
        if (!textElement) return

        const displayTitle = String(title || 'nothing is playing').trim()
        const config = options && typeof options === 'object' ? options : {}
        const token = nextOverflowTitleToken(textElement)
        textElement.dataset.fullTitle = displayTitle

        disableOverflowMarquee(textElement, displayTitle)

        textElement._overflowTitleFrameId = requestAnimationFrame(function() {
            textElement._overflowTitleFrameId = 0
            if (!isOverflowTitleTokenCurrent(textElement, token)) return

            const availableWidth = typeof config.getAvailableWidth === 'function'
                ? Number(config.getAvailableWidth())
                : Number(config.availableWidth || textElement.clientWidth)

            if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
                textElement.style.removeProperty('--now-playing-max-width')
                return
            }

            textElement.style.setProperty('--now-playing-max-width', Math.max(0, Math.floor(availableWidth)) + 'px')

            const titleWidth = measureMarqueeTextWidth(textElement, displayTitle, config.measureHost)
            if (titleWidth - availableWidth > 1) {
                enableOverflowMarquee(textElement, displayTitle, token)
            }
        })
    }

    function formatTrackDisplayTitle(track) {
        if (!track) return 'nothing is playing'

        const title = String(track.title || 'nothing is playing').trim()
        const artist = String(track.artist || '').trim()
        return artist ? title + ' - ' + artist : title
    }

    function getTrackById(trackId) {
        const safeTrackId = String(trackId || '').trim()
        if (!safeTrackId) return null

        const button = buttons.find(function(candidate) {
            return candidate.dataset.trackId === safeTrackId
        })

        return button ? createTrackFromButton(button, buttons.indexOf(button)) : null
    }

    function setNowPlayingTitle(title) {
        const displayTitle = String(title || 'nothing is playing').trim()
        if (miniNowPlayingText) miniNowPlayingText.textContent = displayTitle

        setOverflowTitle(nowPlayingText, displayTitle, {
            measureHost: nowPlaying,
            getAvailableWidth: function() {
                return getNowPlayingAvailableWidth()
            }
        })
    }

    // Recompute sizing when the Music window becomes visible.
    if (musicTab) {
        let wasVisible = isMusicTabVisible()
        const musicTabObserver = new MutationObserver(function() {
            const isVisible = isMusicTabVisible()
            if (isVisible && !wasVisible) {
                const title = nowPlayingText.dataset.fullTitle || nowPlayingText.textContent || 'nothing is playing'
                setNowPlayingTitle(title)
            }
            wasVisible = isVisible
        })

        musicTabObserver.observe(musicTab, { attributes: true, attributeFilter: ['style', 'class'] })
    }

    function updatePlaylistInfo() {
        const current = currentTrackIndex >= 0 ? currentTrackIndex + 1 : 0
        playlistInfo.textContent = current + ' / ' + playlist.length
        if (miniPlaylistInfo) miniPlaylistInfo.textContent = current + ' / ' + playlist.length
    }

    function updateActiveSongButton() {
        buttons.forEach(function(button) {
            button.classList.remove('active-song')
        })

        if (currentTrackIndex < 0 || !playlist[currentTrackIndex]) return
        playlist[currentTrackIndex].button.classList.add('active-song')
    }

    function updatePlayPauseLabel() {
        playPauseBtn.textContent = audio.paused ? 'Play' : 'Pause'
        playPauseBtn.classList.toggle('is-active', !audio.paused)
        if (miniPlayPauseBtn) {
            miniPlayPauseBtn.textContent = audio.paused ? 'Play' : 'Pause'
            miniPlayPauseBtn.classList.toggle('is-active', !audio.paused)
        }
    }

    function updateTimelineUI() {
        if (!audio.duration) {
            seekBar.value = 0
            currentTimeLabel.textContent = '0:00'
            durationLabel.textContent = '0:00'
            if (miniSeekBar) miniSeekBar.value = 0
            if (miniCurrentTimeLabel) miniCurrentTimeLabel.textContent = '0:00'
            if (miniDurationLabel) miniDurationLabel.textContent = '0:00'
            return
        }

        const progress = (audio.currentTime / audio.duration) * 100
        seekBar.value = progress
        currentTimeLabel.textContent = formatTime(audio.currentTime)
        durationLabel.textContent = formatTime(audio.duration)

        if (miniSeekBar) miniSeekBar.value = progress
        if (miniCurrentTimeLabel) miniCurrentTimeLabel.textContent = formatTime(audio.currentTime)
        if (miniDurationLabel) miniDurationLabel.textContent = formatTime(audio.duration)
    }

    function updateShuffleLabel() {
        const label = isShuffle ? 'Shuffle' : 'Shuffle'
        shuffleBtn.textContent = label
        shuffleBtn.classList.toggle('is-active', isShuffle)
        if (miniShuffleBtn) {
            miniShuffleBtn.textContent = label
            miniShuffleBtn.classList.toggle('is-active', isShuffle)
        }
    }

    function stopPlaybackAndReset() {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        currentTrackIndex = -1
        isShuffle = false

        updatePlaylistInfo()
        setNowPlayingTitle('nothing is playing')
        updateActiveSongButton()
        updatePlayPauseLabel()
        updateShuffleLabel()
        updateTimelineUI()
        updateVisualizerEmptyState()
        resetVisualizerState()
        hideMiniPlayer()
        updateYoutubeButtonState()
    }

    function loadTrack(index, shouldAutoplay) {
        if (index < 0 || index >= playlist.length) return

        const track = playlist[index]
        const absoluteTrackPath = new URL(track.path, window.location.href).href
        const isSameTrack = audio.src === absoluteTrackPath

        currentTrackIndex = index
        updatePlaylistInfo()
        updateActiveSongButton()
        setNowPlayingTitle(track.title)

        if (!isSameTrack) {
            audio.src = track.path
            seekBar.value = 0
            currentTimeLabel.textContent = '0:00'
            durationLabel.textContent = '0:00'
        }

        updateVisualizerEmptyState()
        updateYoutubeButtonState()

        if (shouldAutoplay) {
            if (audioCtx.state === 'suspended') audioCtx.resume()
            audio.play()
        }
    }

    function playTrackById(trackId) {
        const safeTrackId = String(trackId || '').trim()
        if (!safeTrackId) return false

        let selectedIndex = playlist.findIndex(function(track) {
            return track && track.id === safeTrackId
        })

        if (selectedIndex === -1) {
            const matchingButton = buttons.find(function(button) {
                return button.dataset.trackId === safeTrackId
            })

            if (!matchingButton) return false

            if (matchingButton.style.display === 'none') {
                filterByGenreAll()
            } else {
                rebuildPlaylist()
            }

            selectedIndex = playlist.findIndex(function(track) {
                return track && track.id === safeTrackId
            })
        }

        if (selectedIndex === -1) return false

        loadTrack(selectedIndex, true)
        return true
    }

    function playNextTrack() {
        if (!playlist.length) return

        if (currentTrackIndex < 0) {
            loadTrack(0, true)
            return
        }

        let nextIndex
        if (isShuffle && playlist.length > 1) {
            do {
                nextIndex = Math.floor(Math.random() * playlist.length)
            } while (nextIndex === currentTrackIndex)
        } else {
            nextIndex = (currentTrackIndex + 1) % playlist.length
        }

        loadTrack(nextIndex, true)
    }

    function playPreviousTrack() {
        if (!playlist.length) return

        if (audio.currentTime > 3) {
            audio.currentTime = 0
            return
        }

        if (currentTrackIndex < 0) {
            loadTrack(0, true)
            return
        }

        const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length
        loadTrack(prevIndex, true)
    }

    function updateYoutubeButtonState() {
        if (!youtubeBtn) return

        const track = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null
        const hasYoutubeUrl = Boolean(track && track.youtubeUrl)
        youtubeBtn.disabled = !hasYoutubeUrl
        youtubeBtn.setAttribute('aria-disabled', hasYoutubeUrl ? 'false' : 'true')
    }

    function openCurrentTrackYoutube() {
        if (currentTrackIndex < 0 || !playlist[currentTrackIndex]) return

        const track = playlist[currentTrackIndex]
        if (!track.youtubeUrl) return

        window.open(track.youtubeUrl, '_blank', 'noopener,noreferrer')
    }

    buttons.forEach(function(button) {
        button.addEventListener('click', function() {
            const songPath = this.dataset.song
            if (!songPath) return

            const selectedIndex = playlist.findIndex(function(track) {
                return track.button === button
            })

            if (selectedIndex !== -1) {
                loadTrack(selectedIndex, true)
            }
        })
    })

    backBtn.addEventListener('click', playPreviousTrack)

    nextBtn.addEventListener('click', playNextTrack)

    shuffleBtn.addEventListener('click', function() {
        isShuffle = !isShuffle
        updateShuffleLabel()
    })

    if (youtubeBtn) youtubeBtn.addEventListener('click', openCurrentTrackYoutube)

    playPauseBtn.addEventListener('click', function() {
        if (!audio.src) {
            if (playlist.length) loadTrack(0, true)
            return
        }
        if (audio.paused) {
            if (audioCtx.state === 'suspended') audioCtx.resume()
            audio.play()
        } else {
            audio.pause()
        }
    })

    if (miniBackBtn) miniBackBtn.addEventListener('click', playPreviousTrack)
    if (miniNextBtn) miniNextBtn.addEventListener('click', playNextTrack)
    if (miniShuffleBtn) {
        miniShuffleBtn.addEventListener('click', function() {
            isShuffle = !isShuffle
            updateShuffleLabel()
        })
    }
    if (miniPlayPauseBtn) {
        miniPlayPauseBtn.addEventListener('click', function() {
            if (!audio.src) {
                if (playlist.length) loadTrack(0, true)
                return
            }
            if (audio.paused) {
                if (audioCtx.state === 'suspended') audioCtx.resume()
                audio.play()
            } else {
                audio.pause()
            }
        })
    }
    if (miniSeekBar) {
        miniSeekBar.addEventListener('input', function() {
            if (!audio.duration) return
            const nextTime = (Number(this.value) / 100) * audio.duration
            audio.currentTime = nextTime
            updateTimelineUI()
        })
    }
    if (miniCloseBtn) {
        miniCloseBtn.addEventListener('click', function() {
            if (musicCloseBtn) {
                musicCloseBtn.click()
            } else {
                stopPlaybackAndReset()
            }
        })
    }

    if (musicTab) {
        const musicTabObserver = new MutationObserver(function() {
            syncMiniPlayerVisibility()
        })
        musicTabObserver.observe(musicTab, { attributes: true, attributeFilter: ['style', 'class'] })
    }

    if (musicCloseBtn) {
        musicCloseBtn.addEventListener('click', function() {
            stopPlaybackAndReset()
        })
    }

    seekBar.addEventListener('input', function() {
        if (!audio.duration) return
        const nextTime = (Number(this.value) / 100) * audio.duration
        audio.currentTime = nextTime
        updateTimelineUI()
    })

    audio.addEventListener('loadedmetadata', function() {
        updateTimelineUI()
    })

    audio.addEventListener('timeupdate', function() {
        updateTimelineUI()
    })

    audio.addEventListener('play', function() {
        if (audioCtx.state === 'suspended') audioCtx.resume()
        updatePlayPauseLabel()
        syncMiniPlayerVisibility()
    })

    audio.addEventListener('pause', function() {
        updatePlayPauseLabel()
        syncMiniPlayerVisibility()
    })

    audio.addEventListener('ended', function() {
        updateTimelineUI()
        syncVisualizerAnimation()
        playNextTrack()
    })

    window.addEventListener('resize', function() {
        if (currentTrackIndex >= 0 && playlist[currentTrackIndex]) {
            setNowPlayingTitle(playlist[currentTrackIndex].title)
        }

        if (window.threeVisualizer && typeof window.threeVisualizer.resize === 'function') {
            window.threeVisualizer.resize()
        }
    })

    updatePlaylistInfo()
    setNowPlayingTitle('nothing is playing')
    updatePlayPauseLabel()
    updateShuffleLabel()
    updateTimelineUI()
    updateVisualizerEmptyState()
    updateYoutubeButtonState()
    pushVisualizerSettings()
    scheduleVisualizerPrime()
    syncMiniPlayerVisibility()

    window.musicPlayerControls = {
        playTrackById: playTrackById,
        getTrackById: getTrackById,
        formatTrackDisplayTitle: formatTrackDisplayTitle,
        setOverflowTitle: setOverflowTitle
    }

    window.dispatchEvent(new CustomEvent('musicplayer:ready'))
}



