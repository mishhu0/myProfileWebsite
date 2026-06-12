function formatBlogDate(value) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value || '')

    return parsed.toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

function getBlogFallbackMessage() {
    return window.DATA_FALLBACK_MESSAGE || "data couldn't be found - working on it..."
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeBlogImageBlock(value) {
    if (!isPlainObject(value)) return null

    const type = String(value.type || '').trim().toLowerCase()
    if (type !== 'image') return null

    const src = String(value.src || value.publicPath || '').trim()
    if (!src) return null

    return {
        type: 'image',
        src: src,
        alt: String(value.alt || value.altText || '').trim()
    }
}

function normalizeBlogContent(postBody) {
    const normalized = []
    const content = Array.isArray(postBody && postBody.content) ? postBody.content : []

    content.forEach(function(entry) {
        if (typeof entry === 'string') {
            const paragraph = entry.trim()
            if (paragraph) {
                normalized.push(paragraph)
            }
            return
        }

        const imageBlock = normalizeBlogImageBlock(entry)
        if (imageBlock) {
            normalized.push(imageBlock)
        }
    })

    const hasInlineImages = normalized.some(function(entry) {
        return isPlainObject(entry) && entry.type === 'image' && entry.src
    })
    const legacyCoverPath = String(postBody && postBody.coverImage || '').trim()

    if (!hasInlineImages && legacyCoverPath) {
        normalized.unshift({
            type: 'image',
            src: legacyCoverPath,
            alt: ''
        })
    }

    return normalized
}

async function initBlogTab() {
    const listRoot = document.getElementById('blogList')
    const detailEmpty = document.getElementById('blogDetailEmpty')
    const article = document.getElementById('blogArticle')
    const title = document.getElementById('blogTitle')
    const date = document.getElementById('blogDate')
    const feeling = document.getElementById('blogFeeling')
    const tags = document.getElementById('blogTags')
    const summary = document.getElementById('blogSummary')
    const body = document.getElementById('blogBody')

    if (!listRoot || !detailEmpty || !article || !title || !date || !feeling || !tags || !summary || !body) return

    function createFallbackIndex() {
        const message = getBlogFallbackMessage()

        return {
            posts: [
                {
                    id: 'blog-fallback',
                    title: message,
                    mainSubject: '',
                    date: new Date().toISOString(),
                    feeling: '',
                    summary: message,
                    tags: [],
                    file: '__fallback__',
                    isFallback: true
                }
            ]
        }
    }

    function createFallbackPost() {
        return {
            isFallback: true,
            content: [getBlogFallbackMessage()]
        }
    }

    function setEmptyState() {
        detailEmpty.style.display = 'flex'
        article.setAttribute('aria-hidden', 'true')
    }

    function setArticleState() {
        detailEmpty.style.display = 'none'
        article.setAttribute('aria-hidden', 'false')
    }

    function renderTags(tagList) {
        tags.innerHTML = ''
        const safeTags = Array.isArray(tagList) ? tagList.filter(Boolean) : []
        safeTags.forEach(function(tagText) {
            const tag = document.createElement('span')
            tag.className = 'blog-tag'
            tag.textContent = String(tagText)
            tags.appendChild(tag)
        })
    }

    function getSafeCssColor(value) {
        const candidate = String(value || '').trim()
        if (!candidate) return ''
        if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return ''
        return CSS.supports('color', candidate) ? candidate : ''
    }

    function getFeelingPalette(postMeta) {
        const primary = getSafeCssColor(postMeta.primary) || getSafeCssColor(postMeta.color) || getSafeCssColor(postMeta.bgcolor) || '#666666'
        const secondary = getSafeCssColor(postMeta.secondary) || primary || '#999999'
        const accent = getSafeCssColor(postMeta.accent) || '#cccccc'
        const text = getSafeCssColor(postMeta.text) || '#ffffff'

        return {
            primary: primary,
            secondary: secondary,
            accent: accent,
            text: text
        }
    }

    function applyFeelingPalette(palette) {
        feeling.style.background = 'linear-gradient(135deg, ' + palette.primary + ', ' + palette.secondary + ')'
        feeling.style.color = palette.text
        feeling.style.borderLeft = '2px solid ' + palette.accent
        feeling.style.borderRight = '2px solid ' + palette.accent
    }

    function renderFeeling(value, postMeta) {
        const safeFeeling = String(value || '').trim()

        if (!safeFeeling) {
            feeling.textContent = ''
            feeling.style.display = 'none'
            feeling.style.background = ''
            feeling.style.color = ''
            feeling.style.borderLeft = ''
            feeling.style.borderRight = ''
            return
        }

        const palette = getFeelingPalette(postMeta || {})
        feeling.textContent = 'feeling: ' + safeFeeling
        applyFeelingPalette(palette)
        feeling.style.display = 'inline-flex'
    }

    function renderBody(postBody) {
        body.innerHTML = ''

        const blocks = normalizeBlogContent(postBody)

        blocks.forEach(function(block) {
            if (typeof block === 'string') {
                const p = document.createElement('p')
                p.textContent = block
                body.appendChild(p)
                return
            }

            const imageBlock = normalizeBlogImageBlock(block)
            if (!imageBlock) return

            const figure = document.createElement('figure')
            figure.className = 'blog-image-block'

            const image = document.createElement('img')
            image.className = 'blog-inline-image'
            image.src = imageBlock.src
            image.alt = imageBlock.alt || ''

            figure.appendChild(image)
            body.appendChild(figure)
        })

        const sections = Array.isArray(postBody && postBody.sections) ? postBody.sections : []
        sections.forEach(function(section) {
            if (!section) return

            if (section.heading) {
                const heading = document.createElement('h3')
                heading.textContent = String(section.heading)
                body.appendChild(heading)
            }

            const sectionParagraphs = Array.isArray(section.paragraphs) ? section.paragraphs.filter(Boolean) : []
            sectionParagraphs.forEach(function(paragraph) {
                const p = document.createElement('p')
                p.textContent = String(paragraph)
                body.appendChild(p)
            })
        })
    }

    async function loadIndex() {
        try {
            const response = await fetch('blogs/index.json', { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load blog index')

            const json = await response.json()
            if (!json || !Array.isArray(json.posts)) throw new Error('Invalid blog index format')
            return json
        } catch (error) {
            console.warn('Using fallback blog index:', error)
            return createFallbackIndex()
        }
    }

    async function loadPost(postMeta) {
        if (postMeta && postMeta.isFallback) {
            return createFallbackPost()
        }

        try {
            const response = await fetch(postMeta.file, { cache: 'no-store' })
            if (!response.ok) throw new Error('Could not load blog post')

            return await response.json()
        } catch (error) {
            console.warn('Using fallback blog post for', postMeta.id + ':', error)
            return createFallbackPost()
        }
    }

    function setActiveListItem(postId) {
        const items = listRoot.querySelectorAll('.blog-list-item')
        items.forEach(function(item) {
            item.classList.toggle('is-active', item.dataset.postId === postId)
        })
    }

    async function showPost(postMeta) {
        const postBody = await loadPost(postMeta)
        title.textContent = postMeta.title || 'Untitled post'
        date.textContent = formatBlogDate(postMeta.date)
        renderFeeling(postMeta.feeling, postMeta)
        summary.textContent = postMeta.summary || ''
        renderTags(postMeta.tags)
        renderBody(postBody)
        setArticleState()
        setActiveListItem(postMeta.id)
    }

    function renderList(posts) {
        listRoot.innerHTML = ''

        const safePosts = Array.isArray(posts) ? posts.filter(function(post) {
            return post && post.id && post.file
        }) : []

        if (!safePosts.length) {
            const empty = document.createElement('p')
            empty.className = 'blog-empty'
            empty.textContent = getBlogFallbackMessage()
            listRoot.appendChild(empty)
            setEmptyState()
            return
        }

        safePosts.forEach(function(post) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'blog-list-item'
            btn.dataset.postId = post.id

            const headingRow = document.createElement('div')
            headingRow.className = 'blog-list-item-heading'

            const metaRow = document.createElement('div')
            metaRow.className = 'blog-list-item-meta'

            const postTitle = document.createElement('span')
            postTitle.className = 'blog-list-item-title'
            postTitle.textContent = post.title || 'Untitled post'

            const subjectText = String(post.mainSubject || '').trim()
            if (subjectText) {
                const postSubject = document.createElement('span')
                postSubject.className = 'blog-list-item-subject'
                postSubject.textContent = subjectText
                metaRow.appendChild(postSubject)
            }

            const postDate = document.createElement('span')
            postDate.className = 'blog-list-item-date'
            postDate.textContent = formatBlogDate(post.date)

            headingRow.appendChild(postTitle)
            metaRow.prepend(postDate)
            btn.appendChild(headingRow)
            btn.appendChild(metaRow)

            btn.addEventListener('click', function() {
                showPost(post).catch(function(error) {
                    console.error('Could not display blog post:', error)
                })
            })

            listRoot.appendChild(btn)
        })

        setEmptyState()
    }

    const index = await loadIndex()
    renderList(index.posts)
}