let highestZ = { value: 0 }

function getUserTime() {
    let now = new Date()
    let date = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
    document.getElementById('time').innerHTML = date

    let delay = (60 - now.getSeconds()) * 1000
    setTimeout(getUserTime, delay)
} getUserTime()

function startMenu() {
    let button = document.getElementById('menu')
    let menu = document.getElementById('menu-content')

    if (!menu.style.display) menu.style.display = 'none'

    function positionMenu() {
        const rect = button.getBoundingClientRect()

        // premeasure menu
        const computed = getComputedStyle(menu)
        const wasHidden = (computed.display === 'none' || menu.offsetHeight === 0)
        const prevDisplay = menu.style.display
        const prevVisibility = menu.style.visibility

        if (wasHidden) {
            menu.style.visibility = 'hidden'
            menu.style.display = 'flex'
        }

        const menuHeight = menu.offsetHeight
        const menuWidth = menu.offsetWidth

        // align above the button if enough space, otherwise below CHANGE SO IT SCALES MAYBE LATER
        let top = rect.top - menuHeight
        if (top < 0) top = rect.bottom

        // align left with button
        let left = rect.left
        if (left + menuWidth > window.innerWidth) left = Math.max(0, window.innerWidth - menuWidth)
        if (left < 0) left = 0

        menu.style.top = top + 'px'
        menu.style.left = left + 'px'

        if (wasHidden) {
            menu.style.display = prevDisplay || 'none'
            menu.style.visibility = prevVisibility || ''
        }
    }

    button.addEventListener('click', function() {
        if (menu.style.display === 'none') {
            positionMenu()
            menu.style.display = 'flex'
        } else {
            menu.style.display = 'none'
        }
    })

    window.addEventListener('resize', function() {
        if (menu.style.display !== 'none') positionMenu()
    })
} startMenu()

function openTab() {
    const icons = document.querySelectorAll('.dsk-icon')
    let selectedIcon = null

    const iconMap = {
        'About me': 'aboutTab',
        'Projects': 'projectsTab',
        'Contact': 'contactTab',
        'Music': 'musicTab'
    }

    icons.forEach(icon => {
        // select
        icon.addEventListener('click', function(e) {
            // deselect previous
            if (selectedIcon) selectedIcon.classList.remove('selected')
            
            // select current
            this.classList.add('selected')
            selectedIcon = this
            e.preventDefault()
            e.stopPropagation()
        })

        // open tab
        icon.addEventListener('dblclick', function(e) {
            const label = this.querySelector('span').textContent
            const tabId = iconMap[label]
            if (tabId) tabsTaskbar.openWindow(tabId)
            e.preventDefault()
        })
    })

    // deselect on background
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dsk-icon')) {
            if (selectedIcon) selectedIcon.classList.remove('selected')
            selectedIcon = null
        }
    })
} openTab()

function exitTab() {
    //START
    let exitbtnStart = document.getElementById('exitbtnStart')
    exitbtnStart.addEventListener('click', function() {
        tabsTaskbar.closeWindow('startTab')
    })
    //ABOUT
    let exitbtnAbout = document.getElementById('exitbtnAbout')
    exitbtnAbout.addEventListener('click', function() {
        tabsTaskbar.closeWindow('aboutTab')
    })

    //PROJECTS
    let exitbtnProjects = document.getElementById('exitbtnProjects')
    exitbtnProjects.addEventListener('click', function() {
        tabsTaskbar.closeWindow('projectsTab')
    })

    //CONTACT
    let exitbtnContact = document.getElementById('exitbtnContact')
    exitbtnContact.addEventListener('click', function() {
        tabsTaskbar.closeWindow('contactTab')
    })

    //MUSIC
    let exitbtnMusic = document.getElementById('exitbtnMusic')
    exitbtnMusic.addEventListener('click', function() {
        tabsTaskbar.closeWindow('musicTab')
    })

    //ABOUT MINIMIZE
    let minbtnAbout = document.getElementById('minbtnAbout')
    minbtnAbout.addEventListener('click', function() {
        tabsTaskbar.minimizeWindow('aboutTab')
    })

    //PROJECTS MINIMIZE
    let minbtnProjects = document.getElementById('minbtnProjects')
    minbtnProjects.addEventListener('click', function() {
        tabsTaskbar.minimizeWindow('projectsTab')
    })

    //CONTACT MINIMIZE
    let minbtnContact = document.getElementById('minbtnContact')
    minbtnContact.addEventListener('click', function() {
        tabsTaskbar.minimizeWindow('contactTab')
    })

    //MUSIC MINIMIZE
    let minbtnMusic = document.getElementById('minbtnMusic')
    minbtnMusic.addEventListener('click', function() {
        tabsTaskbar.minimizeWindow('musicTab')
    })
} exitTab()

function TabsTaskbar() {
    const taskbarTabs = document.getElementById('taskbarTabs')
    const windowConfigs = {
        startTab: {
            label: 'Welcome',
            icon: 'images/start_logo.png'
        },
        aboutTab: {
            label: 'About me',
            icon: 'images/projects_logo.png'
        },
        projectsTab: {
            label: 'My projects',
            icon: 'images/projects_logo.png'
        },
        musicTab: {
            label: 'Music',
            icon: 'images/projects_logo.png'
        },
        contactTab: {
            label: 'Contact me',
            icon: 'images/projects_logo.png'
        }
    }

    function getTab(tabId) {
        return document.getElementById(tabId)
    }

    function getTaskbarButton(tabId) {
        return taskbarTabs.querySelector('[data-tab-id="' + tabId + '"]')
    }

    function setActiveTaskbarButton(tabId) {
        const buttons = taskbarTabs.querySelectorAll('.taskbar-window-btn')
        buttons.forEach(function(button) {
            button.classList.toggle('is-active', button.dataset.tabId === tabId)
        })
    }

    function focusWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        tab.style.display = 'block'
        tab.style.zIndex = ++highestZ.value
        setActiveTaskbarButton(tabId)
    }

    function createTaskbarButton(tabId) {
        if (getTaskbarButton(tabId) || !windowConfigs[tabId]) return

        const wrapper = document.createElement('div')
        wrapper.className = 'taskbar-tab'

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'taskbar-window-btn'
        button.dataset.tabId = tabId

        const icon = document.createElement('img')
        icon.src = windowConfigs[tabId].icon
        icon.alt = windowConfigs[tabId].label + ' icon'

        const label = document.createElement('span')
        label.textContent = windowConfigs[tabId].label

        button.appendChild(icon)
        button.appendChild(label)
        button.addEventListener('click', function() {
            toggleWindow(tabId)
        })

        wrapper.appendChild(button)
        taskbarTabs.appendChild(wrapper)
    }

    function removeTaskbarButton(tabId) {
        const button = getTaskbarButton(tabId)
        if (!button) return

        const wrapper = button.closest('.taskbar-tab')
        if (wrapper) wrapper.remove()
    }

    function toggleWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        const button = getTaskbarButton(tabId)
        if (!button) return

        const isOpen = getComputedStyle(tab).display !== 'none'

        if (isOpen) {
            button.classList.remove('is-active')
            tab.style.display = 'none'
        } else {
            focusWindow(tabId)
        }
    }

    function openWindow(tabId) {
        createTaskbarButton(tabId)
        focusWindow(tabId)
    }

    function closeWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        tab.style.display = 'none'
        removeTaskbarButton(tabId)

        const buttons = taskbarTabs.querySelectorAll('.taskbar-window-btn')
        const lastButton = buttons.length ? buttons[buttons.length - 1] : null
        setActiveTaskbarButton(lastButton ? lastButton.dataset.tabId : '')
    }

    function minimizeWindow(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        tab.style.display = 'none'
        setActiveTaskbarButton('')
    }

    Object.keys(windowConfigs).forEach(function(tabId) {
        const tab = getTab(tabId)
        if (!tab) return

        tab.addEventListener('mousedown', function() {
            if (getComputedStyle(tab).display === 'none') return
            focusWindow(tabId)
        })

        if (getComputedStyle(tab).display !== 'none') {
            createTaskbarButton(tabId)
            setActiveTaskbarButton(tabId)
        }
    })

    return {
        openWindow: openWindow,
        closeWindow: closeWindow,
        focusWindow: focusWindow,
        minimizeWindow: minimizeWindow
    }
}

function welcomeMessage() {
    const welcomeBtn = document.getElementById('utilsWelcomeBtn')
    welcomeBtn.addEventListener('click', function() {
        tabsTaskbar.openWindow('startTab')
    })
} welcomeMessage()

function makeMovable(tab, zTracker, handleSelector = '.popup-title, .tab-title') {
    let isDragging = false
    let startX = 0, startY = 0
    let origX = 0, origY = 0

    function onMouseMove(e) {
        if (!isDragging) return
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        tab.style.left = (origX + dx) + 'px'
        tab.style.top = (origY + dy) + 'px'
    }

    function onMouseUp() {
        if (!isDragging) return
        isDragging = false
        tab.classList.remove('no-select')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
    }

    const handle = tab.querySelector(handleSelector) || tab

    handle.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return // only left mouse
        e.preventDefault()
        isDragging = true
        tab.classList.add('no-select')
        startX = e.clientX
        startY = e.clientY
        origX = tab.offsetLeft
        origY = tab.offsetTop
        tab.style.zIndex = ++zTracker.value
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    })
}
let movableTabs = document.querySelectorAll('.movable')
movableTabs.forEach(function(tab) {
    makeMovable(tab, highestZ)
})

const tabsTaskbar = TabsTaskbar()

function soundVisualizer() {
    const buttons = Array.from(document.querySelectorAll('.songs-lib .song-btn'))

    const canvas = document.getElementById('visualizer')
    const ctx = canvas.getContext('2d')

    const audio = document.getElementById('audio')

    const backBtn = document.getElementById('backBtn')
    const playPauseBtn = document.getElementById('playPauseBtn')
    const nextBtn = document.getElementById('nextBtn')
    const shuffleBtn = document.getElementById('shuffleBtn')
    const downloadBtn = document.getElementById('downloadBtn')
    const nowPlaying = document.getElementById('nowPlaying')
    const nowPlayingText = document.getElementById('nowPlayingText')
    const playlistInfo = document.getElementById('playlistInfo')
    const seekBar = document.getElementById('seekBar')
    const currentTimeLabel = document.getElementById('currentTime')
    const durationLabel = document.getElementById('duration')

    const rotationBar = document.getElementById('rotationViz')
    const vizType = document.getElementById('typeViz')
    const color1Input = document.getElementById('colorPicker1')
    const color2Input = document.getElementById('colorPicker2')
    const color3Input = document.getElementById('colorPicker3')
    const color4Input = document.getElementById('colorPicker4')
    const color5Input = document.getElementById('colorPicker5')

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const analyser = audioCtx.createAnalyser()
    const audioSource = audioCtx.createMediaElementSource(audio)

    audioSource.connect(analyser)
    analyser.connect(audioCtx.destination)
    analyser.fftSize = 256

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let animationId = null
    let currentTrackIndex = -1
    let isShuffle = false
    let visualizerRotation = 0

    // change later for scaling this is just temporary
    // maybe it works as intended i'll check when not lazy
    function resizeCanvas() {
        canvas.width = canvas.clientWidth || 600
        canvas.height = canvas.clientHeight || 180
    }

    function draw() {
        resizeCanvas()
        analyser.getByteFrequencyData(dataArray)
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const barWidth = 5
        let x = 0
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        
        if (vizType.value === 'v1') {
            drawVisualizer1(bufferLength, dataArray, x, barWidth, centerX, centerY)
        } else if (vizType.value === 'v2') {
            drawVisualizer2(bufferLength, dataArray, x, barWidth, centerX, centerY)
        } else if (vizType.value === 'v3') {
            drawVisualizer3(bufferLength, dataArray, x, barWidth, centerX, centerY)
        }

        animationId = requestAnimationFrame(draw)
    }

    function drawVisualizer3(bufferLength, dataArray, x, barWidth, centerX, centerY) {
        const baseRadius = Math.min(canvas.width, canvas.height) * 0.18

        // avarage amplitude for pulse effect
        let sum = 0
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i]
        const avg = sum / bufferLength
        const pulse = avg / 255

        // Apply global rotation
        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(visualizerRotation)
        ctx.translate(-centerX, -centerY)

        // linear gradient
        const grad = ctx.createLinearGradient(0, canvas.height, 0, 0)
        grad.addColorStop(0, '#00d9ff')
        grad.addColorStop(0.55, '#00ff7a')
        grad.addColorStop(1, '#ffe066')

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i]
            ctx.save()
            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate(i + Math.PI * 4 / bufferLength)
            const hue = i * 2
            const red = i * barHeight / 20
            const green = i * 4
            const blue = barHeight / 2
            ctx.fillStyle = 'rgb(' + red + ',' + green + ',' + blue + ')'
            ctx.fillRect(0, 0, barWidth, barHeight)
            ctx.fillStyle = grad
            ctx.fillRect(15, 15, barWidth, barHeight)
            ctx.fillStyle = color1Input.value
            ctx.beginPath()
            ctx.arc(15 + barWidth / 2, barHeight + 20, barWidth / 2, 0, Math.PI * 2)
            ctx.fill()

            ctx.beginPath()
            for (let i = 0; i < bufferLength; i++) {
                const angle = (i / bufferLength) * Math.PI * 2
                const extra = dataArray[i] * 0.35
                const r = baseRadius + extra
                const px = centerX + Math.cos(angle) * r
                const py = centerY + Math.sin(angle) * r
                if (i === 0) ctx.moveTo(px, py)
                else ctx.lineTo(px, py)
            }
            ctx.closePath() // closes last point to first.
            ctx.strokeStyle = 'hsl(' + hue + ', 100%, 50%)'
            ctx.lineWidth = 1.5
            ctx.stroke()

            ctx.globalCompositeOperation = 'lighter'
            for (let i = 0; i < 18; i++) {
                const t = i / 18
                const a = t * Math.PI * 2
                const rr = baseRadius + pulse * 90
                const px = centerX + Math.cos(a) * rr
                const py = centerY + Math.sin(a) * rr
                const dotSize = 2 + pulse * 6
                ctx.fillStyle = 'rgba(120, 200, 255, 0.28)'
                ctx.beginPath()
                ctx.arc(px, py, dotSize, 0, Math.PI * 2)
                ctx.fill()
            }

            x += barWidth
            ctx.restore()
        }
        
        ctx.restore()
        visualizerRotation += rotationBar.value / 1000  // rotation speed
    }

    function drawVisualizer2(bufferLength, dataArray, x, barWidth, centerX, centerY) {
        // rotate whole canvas
        ctx.translate(centerX, centerY)
        ctx.rotate(visualizerRotation)
        ctx.translate(-centerX, -centerY)
        visualizerRotation += rotationBar.value / 1000  // rotation speed

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] * 1.2
            ctx.save()
            ctx.translate(centerX, centerY)
            ctx.rotate(i + Math.PI * 2 / bufferLength)

            ctx.fillStyle = color1Input.value
            ctx.fillRect(15, 0, barWidth, barHeight)
            ctx.fillStyle = color1Input.value
            ctx.beginPath()
            ctx.arc(15 + barWidth / 2, barHeight, barWidth / 2, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = color2Input.value
            ctx.beginPath()
            ctx.arc(15 + barWidth / 2, barHeight + 5, barWidth / 2, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = color3Input.value
            ctx.beginPath()
            ctx.arc(15 + barWidth / 2, barHeight + 10, barWidth / 4, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = color3Input.value
            ctx.fillRect(barHeight, barWidth, barWidth, barHeight / 2)

            x += barWidth
            ctx.restore()
        }
    }

    function drawVisualizer1(bufferLength, dataArray, x, barWidth, centerX, centerY) {
        rotateCanvas(centerX, centerY)
        const amountLines = 6
        const maxLevel = 6
        const spread = dataArray[0] / 255 * Math.PI / 2 + 0.1 // spread based on bass frequency
        const scale = dataArray[0] / 255 * 0.5 + 0.2// scale based on bass frequency
        const subParts = 2


        ctx.strokeStyle = color1Input.value
        ctx.lineWidth = 5

        ctx.save()
        ctx.translate(centerX, centerY)
        for (let i = 0; i < amountLines; i++) {
            drawPart(0, maxLevel, spread, scale, subParts)

            ctx.rotate(Math.PI * 2 / amountLines)
        }
        ctx.restore()

        function drawPart(level, maxLevel, spread, scale, subParts) {
            if (level > maxLevel) return
            const size = 200
            ctx.beginPath()
            ctx.moveTo(0, 0)
            ctx.lineTo(size, 0)
            ctx.stroke()

            for (let i = 0; i < subParts; i++) {
                const position = size - (size / subParts) * i
                ctx.save()
                ctx.translate(position, 0)
                ctx.scale(scale, scale)
                ctx.rotate(spread + dataArray[Math.floor(level * 10)] / 255 * 3) // rotation based on audio data
                drawPart(level + 1, maxLevel, spread, scale, subParts)
                ctx.restore()
            }
        }
    }

    function rotateCanvas(centerX, centerY) {
        // rotate whole canvas
        ctx.translate(centerX, centerY)
        ctx.rotate(visualizerRotation)
        ctx.translate(-centerX, -centerY)
        visualizerRotation += rotationBar.value / 1000  // rotation speed
    }

    const playlist = buttons.map(function(button, index) {
        return {
            index: index,
            button: button,
            path: button.dataset.song,
            title: button.textContent.trim()
        }
    }).filter(function(song) {
        return Boolean(song.path)
    })

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return mins + ':' + String(secs).padStart(2, '0')
    }

    function setNowPlayingTitle(title) {
        const displayTitle = title || 'No song selected'
        nowPlayingText.textContent = displayTitle
        nowPlayingText.classList.remove('marquee')
        nowPlayingText.style.removeProperty('--marquee-distance')
        nowPlayingText.style.removeProperty('--marquee-duration')

        requestAnimationFrame(function() {
            const playlistInfoContainer = nowPlaying.querySelector('.playlist-info-container')
            const containerWidth = playlistInfoContainer ? playlistInfoContainer.offsetWidth : 60
            const availableWidth = nowPlaying.clientWidth - containerWidth - 8
            const textWidth = nowPlayingText.scrollWidth
            const overflow = textWidth - availableWidth
            
            if (overflow > 4) {
                // Duplicate text for seamless loop effect
                nowPlayingText.textContent = displayTitle + '   •   ' + displayTitle
                
                requestAnimationFrame(function() {
                    const fullWidth = nowPlayingText.scrollWidth
                    const marqueeDistance = fullWidth / 2
                    const duration = Math.min(20, Math.max(8, marqueeDistance / 25))
                    
                    nowPlayingText.style.setProperty('--marquee-distance', marqueeDistance + 'px')
                    nowPlayingText.style.setProperty('--marquee-duration', duration + 's')
                    nowPlayingText.classList.add('marquee')
                })
            }
        })
    }

    function updatePlaylistInfo() {
        const current = currentTrackIndex >= 0 ? currentTrackIndex + 1 : 0
        playlistInfo.textContent = current + ' / ' + playlist.length
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

        if (shouldAutoplay) {
            if (audioCtx.state === 'suspended') audioCtx.resume()
            audio.play()
        }
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

    function downloadCurrentTrack() {
        if (currentTrackIndex < 0 || !playlist[currentTrackIndex]) return

        const track = playlist[currentTrackIndex]
        const link = document.createElement('a')
        link.href = track.path
        link.download = (track.title || 'track').replace(/[^a-z0-9 _-]/gi, '_') + '.mp3'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
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
        shuffleBtn.textContent = isShuffle ? 'Shuffle On' : 'Shuffle Off'
        shuffleBtn.classList.toggle('is-active', isShuffle)
    })

    downloadBtn.addEventListener('click', downloadCurrentTrack)

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

    seekBar.addEventListener('input', function() {
        if (!audio.duration) return
        const nextTime = (Number(this.value) / 100) * audio.duration
        audio.currentTime = nextTime
        currentTimeLabel.textContent = formatTime(nextTime)
    })

    audio.addEventListener('loadedmetadata', function() {
        durationLabel.textContent = formatTime(audio.duration)
    })

    audio.addEventListener('timeupdate', function() {
        if (!audio.duration) return
        const progress = (audio.currentTime / audio.duration) * 100
        seekBar.value = progress
        currentTimeLabel.textContent = formatTime(audio.currentTime)
    })

    audio.addEventListener('play', function() {
        if (audioCtx.state === 'suspended') audioCtx.resume()
        updatePlayPauseLabel()
        if (!animationId) draw()
    })

    audio.addEventListener('pause', function() {
        updatePlayPauseLabel()
        if (animationId) {
            cancelAnimationFrame(animationId)
            animationId = null
        }
    })

    audio.addEventListener('ended', function() {
        seekBar.value = 0
        currentTimeLabel.textContent = '0:00'
        if (animationId) {
            cancelAnimationFrame(animationId)
            animationId = null
        }
        playNextTrack()
    })

    window.addEventListener('resize', function() {
        if (currentTrackIndex >= 0 && playlist[currentTrackIndex]) {
            setNowPlayingTitle(playlist[currentTrackIndex].title)
        }
    })

    setNowPlayingTitle('No song selected')
    updatePlaylistInfo()
    updatePlayPauseLabel()
} soundVisualizer()