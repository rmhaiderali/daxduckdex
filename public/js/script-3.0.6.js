// API Base URL
const API_BASE = ""

class DaxDuckDex {
  constructor() {
    this.version = "3.0.6"
    this.allCharacters = []
    this.filteredCharacters = []
    this.isAscending = true
    this.isGridView = true
    this.searchTimeout = null
    this.scrollTimeout = null
    this.scrollHandler = null
    this.observer = null
    this.pageSize = 50
    this.currentPage = 1
    this.allArchives = []
    this.filteredArchives = []
    this.archivesSearchTimeout = null
    this.selectedYear = ""
    this.lastUpdateCheck = Date.now()
    this.autoRefreshInterval = null
    this.dataHash = null

    this.init()
  }

  checkVersion() {
    try {
      const storedVersion = localStorage.getItem("APP_VERSION")
      if (storedVersion && storedVersion !== this.version) {
        // Clear cache keys when version changes
        const keysToClear = [
          "daxduckdx-cache",
          "daxduckdx-cache-time",
          "dax_archives_cache",
          "dax_archives_cache_time",
        ]
        keysToClear.forEach((k) => localStorage.removeItem(k))
      }
      localStorage.setItem("APP_VERSION", this.version)
    } catch (e) {
      // If localStorage is full or private, don't explode
      console.warn("Storage check failed:", e)
    }
  }

  init() {
    this.checkVersion()
    this.cacheDOM()
    this.bindEvents()
    this.initIntersectionObserver()
    this.loadViewPreferences()
    this.loadCharacters()
    this.loadArchives()
    this.startAutoRefresh()
  }

  cacheDOM() {
    this.dom = {
      navLinks: document.querySelectorAll(".nav-link"),
      dexSection: document.getElementById("dex-section"),
      archivesSection: document.getElementById("archives-section"),
      aboutSection: document.getElementById("about-section"),
      submitSection: document.getElementById("submit-section"),
      searchContainer: document.querySelector(".search-container"),
      filtersContainer: document.querySelector(".filters-container"),
      searchInput: document.getElementById("searchInput"),
      clearSearch: document.getElementById("clearSearch"),
      sortOrderBtn: document.getElementById("sortOrderBtn"),
      viewModeBtn: document.getElementById("viewModeBtn"),
      refreshBtn: document.getElementById("refreshBtn"),
      gallery: document.getElementById("gallery"),
      loading: document.getElementById("loading"),
      stats: document.getElementById("stats"),
      noResults: document.getElementById("noResults"),
      sortOrderText: document.getElementById("sortOrderText"),
      sortOrderIcon: document.getElementById("sortOrderIcon"),
      viewModeText: document.getElementById("viewModeText"),
      viewModeIcon: document.getElementById("viewModeIcon"),
      yearSelect: document.getElementById("yearSelect"),
      archivesSearchInput: document.getElementById("archivesSearchInput"),
      clearArchivesSearch: document.getElementById("clearArchivesSearch"),
      archivesStats: document.getElementById("archivesStats"),
      archivesLoading: document.getElementById("archivesLoading"),
      archivesGallery: document.getElementById("archivesGallery"),
      archivesNoResults: document.getElementById("archivesNoResults"),
    }
  }

  bindEvents() {
    this.dom.navLinks.forEach((link) => {
      link.addEventListener("click", (e) => this.handleNavigation(e))
    })

    this.dom.searchInput.addEventListener("input", () => this.debouncedSearch())
    this.dom.clearSearch.addEventListener("click", () => this.clearSearch())
    this.dom.sortOrderBtn.addEventListener("click", () =>
      this.toggleSortOrder(),
    )
    this.dom.viewModeBtn.addEventListener("click", () => this.toggleViewMode())
    this.dom.refreshBtn.addEventListener("click", () => this.manualRefresh())

    this.dom.archivesSearchInput.addEventListener("input", () =>
      this.debouncedArchivesSearch(),
    )
    this.dom.clearArchivesSearch.addEventListener("click", () =>
      this.clearArchivesSearch(),
    )
    this.dom.yearSelect.addEventListener("change", () =>
      this.filterArchivesByYear(),
    )

    this.dom.gallery.addEventListener("click", (e) => {
      const discovererLink = e.target.closest(".discoverer-link")
      if (discovererLink) {
        e.stopPropagation()
        e.preventDefault()
        const discoverer = discovererLink.dataset.discoverer
        this.searchByDiscoverer(discoverer)
        return
      }

      const tag = e.target.closest(".clickable-tag")
      if (tag) {
        e.stopPropagation()
        e.preventDefault()
        const tagName = tag.dataset.tag
        this.searchByTag(tagName)
        return
      }

      const card = e.target.closest(".character-card")
      if (card) {
        const name = card.dataset.name
        const url = card.dataset.url
        this.openCharacterDetails(name, url)
      }
    })
  }

  initIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target
            if (!img.src || img.src.startsWith("data:image/svg+xml")) {
              img.src = img.dataset.src
              img.onload = () => (img.style.opacity = 1)
            } else if (img.style.opacity === "0") {
              img.style.opacity = 1
            }
            this.observer.unobserve(img)
          }
        })
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      },
    )
  }

  loadViewPreferences() {
    const savedViewMode = localStorage.getItem("daxduckdex-viewMode")
    if (savedViewMode) {
      this.isGridView = savedViewMode === "grid"
      this.updateViewModeUI()
    }

    const savedSortOrder = localStorage.getItem("daxduckdex-sortOrder")
    if (savedSortOrder) {
      this.isAscending = savedSortOrder === "asc"
      this.updateSortOrderUI()
    }
  }

  async loadCharacters() {
    try {
      // Check cache first
      const cachedData = localStorage.getItem("daxduckdex-cache")
      const cacheTime = localStorage.getItem("daxduckdex-cache-time")

      // Use cache if less than 1 day old
      if (cachedData && cacheTime && Date.now() - cacheTime < 86400000) {
        this.allCharacters = JSON.parse(cachedData)
        this.dataHash = this.allCharacters.length.toString() // Initialize dataHash for auto-refresh
        this.filterAndSortCharacters()
        this.updateDynamicMetaTags()
        this.dom.loading.style.display = "none"
        return
      }

      const timestamp = Date.now()
      const response = await fetch(`${API_BASE}/api/characters?v=${timestamp}`)
      if (!response.ok) throw new Error("Error loading characters from API")

      const apiData = await response.json()
      if (!apiData.success) throw new Error("API returned error")

      // Extract characters array from API response
      this.allCharacters = apiData.characters
      this.dataHash = apiData.count.toString()

      // Update cache
      localStorage.setItem(
        "daxduckdex-cache",
        JSON.stringify(this.allCharacters),
      )
      localStorage.setItem("daxduckdex-cache-time", Date.now())

      this.filterAndSortCharacters()
      this.updateDynamicMetaTags()
      this.dom.loading.style.display = "none"
    } catch (error) {
      console.error("Error:", error)
      this.dom.loading.innerHTML = `
                <h3>Loading Error</h3>
                <p>Unable to load characters. ${error.message}</p>
                ${this.allCharacters.length ? "<p>Showing cached data.</p>" : ""}
            `

      if (!this.allCharacters.length) {
        this.dom.noResults.style.display = "block"
      }
    } finally {
      this.dom.stats.style.display = "block"
    }
  }

  formatDate(dateString) {
    if (!dateString) return ""
    const date = new Date(dateString)
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
    return date.toLocaleDateString("en-US", options)
  }

  isCharacterNew(character) {
    if (!character.discovered_date) return false

    const discoveredDate = new Date(character.discovered_date)
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    return discoveredDate >= oneWeekAgo
  }

  formatArchiveDate(dateString) {
    if (!dateString) return ""

    const rangeMatch = dateString.match(/^(\w+ \d+)-(\d+), (\d+)$/)
    if (rangeMatch) {
      const [, startDate, endDay, year] = rangeMatch
      const startParts = startDate.split(" ")
      const month = startParts[0]
      const startDay = startParts[1]
      return `${month} ${startDay}-${endDay}, ${year}`
    }

    if (dateString.includes(" - ")) {
      return dateString
    }

    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
      const options = {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
      return date.toLocaleDateString("en-US", options)
    } catch (error) {
      return dateString
    }
  }

  setFallbackImage(event) {
    event.target.src =
      "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiNmMGYwZjAiLz4KPHN2ZyB4PSIyMCIgeT0iMjAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjY2NjIj4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiPgogIDxwYXRoIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIyIiBkPSJNMTYgN2E0IDQgMCAxIDEtOCAwIDQgNCAwIDAgMSA4IDB6TTEyIDVhMyAzIDAgMCAxIDMgM3YuMDFNMTIgMTRhOCA4IDAgMCAxIDggOHYxSDBWMjJhOCA4IDAgMCAxIDgtOHoiLz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K"
  }

  setModalFallbackImage(event) {
    event.target.src =
      "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHRleHQgeD0iMTAwIiB5PSIxMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOTk5Ij5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg=="
  }

  debouncedSearch() {
    clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => {
      this.filterAndSortCharacters()
    }, 300)
  }

  handleNavigation(e) {
    e.preventDefault()

    const clickedLink = e.currentTarget
    const section = clickedLink.dataset.section

    this.dom.navLinks.forEach((link) => link.classList.remove("active"))

    clickedLink.classList.add("active")

    this.dom.dexSection.classList.remove("active")
    this.dom.archivesSection.classList.remove("active")
    this.dom.aboutSection.classList.remove("active")
    this.dom.submitSection.classList.remove("active")

    switch (section) {
      case "dex":
        this.dom.dexSection.classList.add("active")
        this.showSearchAndFilters()
        break
      case "archives":
        this.dom.archivesSection.classList.add("active")
        this.hideSearchAndFilters()
        break
      case "about":
        this.dom.aboutSection.classList.add("active")
        this.hideSearchAndFilters()
        break
      case "submit":
        this.dom.submitSection.classList.add("active")
        this.hideSearchAndFilters()
        break
    }

    console.log(`Navigated to section: ${section}`)
  }

  showSearchAndFilters() {
    this.dom.searchContainer.style.display = "block"
    this.dom.filtersContainer.style.display = "flex"
  }

  hideSearchAndFilters() {
    this.dom.searchContainer.style.display = "none"
    this.dom.filtersContainer.style.display = "none"
  }

  clearSearch() {
    this.dom.searchInput.value = ""
    this.dom.clearSearch.style.display = "none"
    this.filterAndSortCharacters()
    this.dom.searchInput.focus()
  }

  toggleClearButton() {
    if (this.dom.searchInput.value.length > 0) {
      this.dom.clearSearch.style.display = "block"
    } else {
      this.dom.clearSearch.style.display = "none"
    }
  }

  sortCharacters(characters) {
    return [...characters].sort((a, b) => {
      const aValue = a.name.toLowerCase()
      const bValue = b.name.toLowerCase()

      if (aValue < bValue) return this.isAscending ? -1 : 1
      if (aValue > bValue) return this.isAscending ? 1 : -1
      return 0
    })
  }

  filterAndSortCharacters() {
    const searchTerm = this.dom.searchInput.value.toLowerCase()
    this.currentPage = 1

    let filtered = this.allCharacters.filter((character) => {
      const nameMatch = character.name.toLowerCase().includes(searchTerm)
      const discovererMatch =
        character.discoverer &&
        character.discoverer.toLowerCase().includes(searchTerm)
      const tagsMatch =
        character.tags &&
        character.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
      return nameMatch || discovererMatch || tagsMatch
    })

    this.filteredCharacters = this.sortCharacters(filtered)

    // Track search for analytics (privacy-first)
    if (searchTerm.length > 0 && window.daxAnalytics) {
      window.daxAnalytics.trackSearch(
        searchTerm,
        this.filteredCharacters.length,
      )
    }

    this.displayCharacters()
    this.updateStats()
    this.toggleClearButton()
    this.addDiscovererSearchFeedback(searchTerm)
  }

  addDiscovererSearchFeedback(searchTerm) {
    const exactDiscovererMatch = this.allCharacters.find(
      (char) => char.discoverer && char.discoverer.toLowerCase() === searchTerm,
    )

    if (exactDiscovererMatch && this.filteredCharacters.length > 1) {
      this.dom.searchInput.style.borderColor = "#4caf50"
      this.dom.searchInput.style.boxShadow = "0 0 10px rgba(76, 175, 80, 0.3)"

      setTimeout(() => {
        this.dom.searchInput.style.borderColor = ""
        this.dom.searchInput.style.boxShadow = ""
      }, 2000)
    }
  }

  toggleViewMode() {
    this.isGridView = !this.isGridView
    this.updateViewModeUI()
    this.displayCharacters()
    localStorage.setItem(
      "daxduckdex-viewMode",
      this.isGridView ? "grid" : "list",
    )
  }

  updateViewModeUI() {
    if (this.isGridView) {
      this.dom.viewModeText.textContent = "Grid"
      this.dom.viewModeIcon.textContent = "⚏"
      this.dom.gallery.classList.remove("list-view")
    } else {
      this.dom.viewModeText.textContent = "List"
      this.dom.viewModeIcon.textContent = "☰"
      this.dom.gallery.classList.add("list-view")
    }
  }

  toggleSortOrder() {
    this.isAscending = !this.isAscending
    this.updateSortOrderUI()
    this.filterAndSortCharacters()
    localStorage.setItem(
      "daxduckdex-sortOrder",
      this.isAscending ? "asc" : "desc",
    )
  }

  updateSortOrderUI() {
    this.dom.sortOrderText.textContent = this.isAscending ? "A → Z" : "Z → A"
    this.dom.sortOrderIcon.textContent = this.isAscending ? "⬆️" : "⬇️"
  }

  searchByDiscoverer(discovererName) {
    this.dom.searchInput.value = discovererName
    this.filterAndSortCharacters()
    this.showToast(`Showing all characters discovered by ${discovererName}`)

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })

    setTimeout(() => {
      this.dom.searchInput.focus()
      this.dom.searchInput.select()
    }, 500)
  }

  searchByTag(tagName) {
    this.dom.searchInput.value = tagName
    this.filterAndSortCharacters()
    this.showToast(`Showing all characters tagged with #${tagName}`)

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })

    setTimeout(() => {
      this.dom.searchInput.focus()
      this.dom.searchInput.select()
    }, 500)
  }

  showToast(message) {
    const existingToast = document.querySelector(".toast")
    if (existingToast) existingToast.remove()

    const toast = document.createElement("div")
    toast.className = "toast"
    toast.textContent = message
    toast.setAttribute("aria-live", "polite")

    document.body.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, 3000)
  }

  displayCharacters() {
    if (this.filteredCharacters.length === 0) {
      this.dom.gallery.innerHTML = ""
      this.dom.noResults.style.display = "block"
      return
    }

    this.dom.noResults.style.display = "none"

    const itemsToShow = this.filteredCharacters.slice(
      0,
      this.currentPage * this.pageSize,
    )

    const loadedImages = new Map()
    document.querySelectorAll(".character-image img").forEach((img) => {
      if (
        img.src &&
        !img.src.startsWith("data:image/svg+xml") &&
        img.style.opacity === "1"
      ) {
        const altText = img.alt
        loadedImages.set(altText, {
          src: img.src,
          loaded: true,
        })
      }
    })

    if (this.isGridView) {
      this.renderGridView(itemsToShow, loadedImages)
    } else {
      this.renderListView(itemsToShow, loadedImages)
    }

    document
      .querySelectorAll(".character-image img[data-src]")
      .forEach((img) => {
        if (!loadedImages.has(img.alt)) {
          this.observer.observe(img)
        }
      })

    if (this.filteredCharacters.length > this.currentPage * this.pageSize) {
      this.removeScrollListener()
      this.scrollHandler = this.handleScroll.bind(this)
      window.addEventListener("scroll", this.scrollHandler, { passive: true })
    } else {
      this.removeScrollListener()
    }
  }

  removeScrollListener() {
    if (this.scrollHandler) {
      window.removeEventListener("scroll", this.scrollHandler)
      this.scrollHandler = null
    }
  }

  renderGridView(characters, loadedImages = new Map()) {
    const fragment = document.createDocumentFragment()

    characters.forEach((character) => {
      const imageData = loadedImages.get(character.name)
      const imageSrc = imageData?.loaded ? imageData.src : ""
      const opacity = imageData?.loaded ? "1" : "0"
      const dataSrc = imageData?.loaded ? "" : `data-src="${character.url}"`
      const isNew = this.isCharacterNew(character)

      const cardDiv = document.createElement("div")
      cardDiv.className = "character-card"
      cardDiv.dataset.name = character.name
      cardDiv.dataset.url = character.url
      cardDiv.tabIndex = 0
      cardDiv.setAttribute("role", "button")
      cardDiv.setAttribute("aria-label", `View details for ${character.name}`)

      cardDiv.innerHTML = `
                ${isNew ? '<div class="new-badge"><img src="./img/new.png" alt="New" /></div>' : ""}
                <div class="character-image">
                    <img ${dataSrc} ${imageSrc ? `src="${imageSrc}"` : ""} alt="${character.name}" 
                         onerror="daxDuckDex.setFallbackImage(event)"
                         style="opacity: ${opacity}; transition: opacity 0.3s ease">
                </div>
                <div class="character-name">${character.name}</div>
            `

      fragment.appendChild(cardDiv)
    })

    this.dom.gallery.innerHTML = ""
    this.dom.gallery.appendChild(fragment)
  }

  renderListView(characters, loadedImages = new Map()) {
    const fragment = document.createDocumentFragment()

    characters.forEach((character) => {
      const imageData = loadedImages.get(character.name)
      const imageSrc = imageData?.loaded ? imageData.src : ""
      const opacity = imageData?.loaded ? "1" : "0"
      const dataSrc = imageData?.loaded ? "" : `data-src="${character.url}"`
      const isNew = this.isCharacterNew(character)

      const cardDiv = document.createElement("div")
      cardDiv.className = "character-card list-item"
      cardDiv.dataset.name = character.name
      cardDiv.dataset.url = character.url
      cardDiv.tabIndex = 0
      cardDiv.setAttribute("role", "button")
      cardDiv.setAttribute("aria-label", `View details for ${character.name}`)

      cardDiv.innerHTML = `
                ${isNew ? '<div class="new-badge list-view"><img src="./img/new.png" alt="New" /></div>' : ""}
                <div class="character-main">
                    <div class="character-image">
                        <img ${dataSrc} ${imageSrc ? `src="${imageSrc}"` : ""} alt="${character.name}" 
                             onerror="daxDuckDex.setFallbackImage(event)"
                             style="opacity: ${opacity}; transition: opacity 0.3s ease">
                    </div>
                    <div class="character-info">
                        <div class="character-name">${character.name}</div>
                        ${
                          character.discoverer
                            ? `
                        <div class="character-discoverer">
                            🧍 Discovered by 
                            <button class="discoverer-link" 
                                    data-discoverer="${character.discoverer.replace(/'/g, "\\'")}" 
                                    title="View all discoveries by ${character.discoverer}">
                                ${character.discoverer}
                            </button>
                        </div>`
                            : ""
                        }
                        ${
                          character.discovered_date
                            ? `
                        <div class="character-date">${this.formatDate(character.discovered_date)}</div>`
                            : ""
                        }
                    </div>
                </div>
                ${
                  character.tags && character.tags.length > 0
                    ? `
                <div class="character-tags-container">
                    <div class="character-tags">
                        ${character.tags
                          .map(
                            (tag) => `
                        <span class="tag clickable-tag" 
                              data-tag="${tag.replace(/'/g, "\\'")}" 
                              title="Search for #${tag}">
                            #${tag}
                        </span>`,
                          )
                          .join(" ")}
                    </div>
                </div>`
                    : '<div class="character-tags-container"></div>'
                }
            `

      fragment.appendChild(cardDiv)
    })

    this.dom.gallery.innerHTML = ""
    this.dom.gallery.appendChild(fragment)
  }

  handleScroll() {
    if (this.scrollTimeout) return

    this.scrollTimeout = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        this.currentPage++
        this.displayCharacters()
      }
      this.scrollTimeout = null
    }, 100)
  }

  openCharacterDetails(name, url) {
    if (document.querySelector(".modal-overlay")) {
      return
    }

    // Track character view for analytics (privacy-first)
    if (window.daxAnalytics) {
      window.daxAnalytics.trackCharacterView(name)
    }

    const character = this.allCharacters.find((char) => char.name === name)
    const discoverer = character?.discoverer || null
    const discoveredDate = character?.discovered_date || null
    const tags = character?.tags || null

    const modal = document.createElement("div")
    modal.className = "modal-overlay"

    modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close-btn" 
                        onclick="daxDuckDex.closeModal()" 
                        title="Close"
                        aria-label="Close modal">
                    ✕
                </button>
                
                <div class="modal-header">
                    <h2>${name}</h2>
                </div>

                <div class="modal-image-container">
                    <img class="modal-image" src="${url}" alt="${name}" 
                         onerror="daxDuckDex.setModalFallbackImage(event)">
                </div>

                <div class="modal-bottom-section">
                    <div class="modal-info-section">
                        ${
                          discoverer
                            ? `
                        <div class="modal-discoverer-box">
                            <p class="modal-discoverer-text">
                                Discovered by: 
                                <button class="modal-discoverer-link" 
                                        onclick="daxDuckDex.searchByDiscoverer('${discoverer.replace(/'/g, "\\'")}'); daxDuckDex.closeModal()" 
                                        title="View all discoveries by ${discoverer}">
                                    ${discoverer}
                                </button>
                            </p>
                        </div>`
                            : ""
                        }
                        ${
                          discoveredDate
                            ? `
                        <p class="modal-date-text">${this.formatDate(discoveredDate)}</p>`
                            : ""
                        }
                    </div>
                    
                    ${tags?.length ? `<div class="modal-separator"></div>` : ""}
                    
                    ${
                      tags?.length
                        ? `
                    <div class="modal-tags-section">
                        <div class="modal-tags-container">
                            ${tags
                              .map(
                                (tag) => `
                            <span class="modal-tag" 
                                  onclick="daxDuckDex.searchByTag('${tag.replace(/'/g, "\\'")}'); daxDuckDex.closeModal()" 
                                  title="Search for #${tag}">
                                #${tag}
                            </span>`,
                              )
                              .join("")}
                        </div>
                    </div>`
                        : ""
                    }
                    
                    <div class="modal-ddg-section" ${!tags?.length ? 'style="margin-top: 15px;"' : ""}>
                        <a class="modal-ddg-link" 
                           href="https://duckduckgo.com/?q=${encodeURIComponent(name.replace(/\./g, ""))}" 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           title="Search on DuckDuckGo">
                            <img class="modal-ddg-logo" src="./img/ddgLogo.png" alt="DuckDuckGo">
                            Search on DuckDuckGo
                        </a>
                    </div>
                </div>
            </div>
        `

    modal.onclick = (e) => {
      if (e.target === modal) {
        this.closeModal()
      }
    }

    document.body.appendChild(modal)
    document.body.style.overflow = "hidden"
  }

  closeModal() {
    const modal = document.querySelector(".modal-overlay")
    if (modal) {
      modal.remove()
      document.body.style.overflow = ""
    }
  }

  updateStats() {
    const total = this.allCharacters.length
    const filtered = this.filteredCharacters.length
    const searchTerm = this.dom.searchInput.value.toLowerCase()

    if (filtered === total) {
      this.dom.stats.textContent = `${total} character${total !== 1 ? "s" : ""}`
    } else {
      const discovererMatches = this.allCharacters.filter(
        (char) =>
          char.discoverer && char.discoverer.toLowerCase() === searchTerm,
      )

      if (
        discovererMatches.length > 0 &&
        discovererMatches.length === filtered
      ) {
        const discovererName = discovererMatches[0].discoverer
        this.dom.stats.innerHTML = `
                    ${filtered} character${filtered !== 1 ? "s" : ""} discovered by ${discovererName} 
                    <a href="https://www.reddit.com/user/${discovererName}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       title="View ${discovererName}'s Reddit profile" 
                       style="display: inline-block; margin-left: 4px; vertical-align: middle;">
                        <img src="./img/redditLink.webp" 
                             alt="Open Reddit profile" 
                             style="width: 18px; height: 18px; opacity: 0.7; transition: opacity 0.3s ease;" 
                             onmouseover="this.style.opacity='1'" 
                             onmouseout="this.style.opacity='0.7'">
                    </a>`
      } else {
        this.dom.stats.textContent = `${filtered} of ${total} character${total !== 1 ? "s" : ""}`
      }
    }
  }

  updateDynamicMetaTags() {
    const total = this.allCharacters.length

    // Update page title
    document.title = `DaxDuckDex - Collection of ${total} Dax Characters | Mak Dulac`

    const metaDescription = document.querySelector('meta[name="description"]')
    if (metaDescription) {
      metaDescription.content = `DaxDuckDex - The ultimate collection of ${total} Dax characters from DuckDuckGo. Discover, explore and submit new characters in this comprehensive database.`
    }

    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) {
      ogTitle.content = `DaxDuckDex - Collection of ${total} Dax Characters`
    }

    const ogDescription = document.querySelector(
      'meta[property="og:description"]',
    )
    if (ogDescription) {
      ogDescription.content = `Discover the ultimate collection of ${total} Dax characters from DuckDuckGo. Submit new discoveries and explore unique characters.`
    }

    const twitterTitle = document.querySelector('meta[name="twitter:title"]')
    if (twitterTitle) {
      twitterTitle.content = `DaxDuckDex - Collection of ${total} Dax Characters`
    }

    const jsonLdScript = document.querySelector(
      'script[type="application/ld+json"]',
    )
    if (jsonLdScript) {
      try {
        const schemaData = JSON.parse(jsonLdScript.textContent)
        schemaData.description = `Ultimate collection of ${total} Dax characters from DuckDuckGo`
        schemaData.mainEntity.numberOfItems = total.toString()
        jsonLdScript.textContent = JSON.stringify(schemaData, null, 4)
      } catch (e) {
        console.warn("Failed to update JSON-LD schema:", e)
      }
    }
  }

  // Archives Methods
  async loadArchives() {
    try {
      this.dom.archivesLoading.style.display = "block"

      const response = await fetch(`./holiday_logos-${this.version}.json`)
      if (!response.ok) throw new Error("Error loading archives")

      this.allArchives = await response.json()
      this.populateYearFilter()
      this.filterAndDisplayArchives()
    } catch (error) {
      console.error("Error loading archives:", error)
      this.dom.archivesLoading.innerHTML =
        '<p style="color: var(--color-text);">Error loading archives. Please try again later.</p>'
    }
  }

  populateYearFilter() {
    const years = new Set()
    this.allArchives.forEach((archive) => {
      const year = new Date(archive.date).getFullYear()
      if (!isNaN(year)) {
        years.add(year)
      }
    })

    const sortedYears = Array.from(years).sort((a, b) => b - a)

    sortedYears.forEach((year) => {
      const option = document.createElement("option")
      option.value = year
      option.textContent = year
      this.dom.yearSelect.appendChild(option)
    })
  }

  debouncedArchivesSearch() {
    clearTimeout(this.archivesSearchTimeout)
    this.archivesSearchTimeout = setTimeout(() => {
      this.filterAndDisplayArchives()
    }, 300)

    const hasValue = this.dom.archivesSearchInput.value.trim() !== ""
    this.dom.clearArchivesSearch.classList.toggle("visible", hasValue)
  }

  clearArchivesSearch() {
    this.dom.archivesSearchInput.value = ""
    this.dom.clearArchivesSearch.classList.remove("visible")
    this.filterAndDisplayArchives()
  }

  filterArchivesByYear() {
    this.selectedYear = this.dom.yearSelect.value
    this.filterAndDisplayArchives()
  }

  filterAndDisplayArchives() {
    const searchTerm = this.dom.archivesSearchInput.value.toLowerCase()

    this.filteredArchives = this.allArchives.filter((archive) => {
      const matchesSearch =
        searchTerm === "" ||
        archive.event.toLowerCase().includes(searchTerm) ||
        archive.date.toLowerCase().includes(searchTerm)

      const matchesYear =
        this.selectedYear === "" ||
        new Date(archive.date).getFullYear().toString() === this.selectedYear

      return matchesSearch && matchesYear
    })

    this.filteredArchives.sort((a, b) => new Date(b.date) - new Date(a.date))

    this.displayArchives()
    this.updateArchivesStats()
  }

  displayArchives() {
    this.dom.archivesLoading.style.display = "none"

    if (this.filteredArchives.length === 0) {
      this.dom.archivesGallery.style.display = "none"
      this.dom.archivesNoResults.style.display = "block"
    } else {
      this.dom.archivesGallery.style.display = "grid"
      this.dom.archivesNoResults.style.display = "none"

      const fragment = document.createDocumentFragment()

      this.filteredArchives.forEach((archive) => {
        const formattedDate = this.formatArchiveDate(archive.date)

        const cardDiv = document.createElement("div")
        cardDiv.className = "archive-card"
        cardDiv.innerHTML = `
                    <img src="${archive.local_image_path}" 
                         alt="${archive.event}" 
                         class="archive-image"
                         loading="lazy"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="archive-placeholder" style="display: none; height: 200px; background: var(--color-accent); align-items: center; justify-content: center; color: var(--color-text-light);">
                        <span>Image not available</span>
                    </div>
                    <div class="archive-content">
                        <div class="archive-date">${formattedDate}</div>
                        <h3 class="archive-event">${archive.event}</h3>
                    </div>
                `

        fragment.appendChild(cardDiv)
      })

      this.dom.archivesGallery.innerHTML = ""
      this.dom.archivesGallery.appendChild(fragment)
    }
  }

  updateArchivesStats() {
    const total = this.allArchives.length
    const filtered = this.filteredArchives.length
    const searchTerm = this.dom.archivesSearchInput.value.trim()

    let statsText = ""
    if (filtered === total) {
      statsText = `${total} archived events`
    } else {
      statsText = `${filtered} of ${total} events`
      if (searchTerm) {
        statsText += ` matching "${searchTerm}"`
      }
      if (this.selectedYear) {
        statsText += ` from ${this.selectedYear}`
      }
    }

    this.dom.archivesStats.textContent = statsText
  }

  startAutoRefresh() {
    this.autoRefreshInterval = setInterval(
      () => {
        this.checkForUpdates()
      },
      2 * 60 * 1000,
    )
  }

  async checkForUpdates() {
    try {
      const timestamp = Date.now()
      const response = await fetch(
        `${API_BASE}/api/characters?v=${timestamp}`,
        {
          method: "GET",
          cache: "no-cache",
        },
      )

      if (!response.ok) return

      const apiData = await response.json()
      if (!apiData.success) return

      // Use count as stable hash (only changes when data actually changes)
      const currentHash = apiData.count.toString()

      if (this.dataHash && this.dataHash !== currentHash) {
        this.showUpdateButton()
        this.dataHash = currentHash
      } else if (!this.dataHash) {
        this.dataHash = currentHash
      }
    } catch (error) {
      console.log("Auto-refresh check failed:", error)
    }
  }

  showUpdateButton() {
    if (this.dom.refreshBtn) {
      this.dom.refreshBtn.classList.remove("hidden")
      this.showToast(
        "New characters available! Click the Update button to refresh.",
      )
    }
  }

  hideUpdateButton() {
    if (this.dom.refreshBtn) {
      this.dom.refreshBtn.classList.add("hidden")
    }
  }

  showUpdateNotification() {
    const notification = document.createElement("div")
    notification.className = "update-notification"
    notification.innerHTML = `
            <span>🆕 New characters detected!</span>
            <button onclick="this.parentElement.remove()">✕</button>
        `

    document.body.appendChild(notification)

    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 5000)
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval)
      this.autoRefreshInterval = null
    }
  }

  async manualRefresh() {
    this.dom.refreshBtn.classList.add("refreshing")
    this.dom.refreshBtn.disabled = true

    try {
      localStorage.removeItem("daxduckdex-cache")
      localStorage.removeItem("daxduckdex-cache-time")

      await this.loadCharacters()

      this.hideUpdateButton()

      this.showToast("Database updated with new characters!")
    } catch (error) {
      console.error("Manual refresh failed:", error)
      this.showToast("Refresh failed. Please try again.")
    } finally {
      setTimeout(() => {
        this.dom.refreshBtn.classList.remove("refreshing")
        this.dom.refreshBtn.disabled = false
      }, 500)
    }
  }
}

// Reddit Authentication and Submission Manager
class RedditSubmissionManager {
  constructor() {
    this.apiBaseUrl = API_BASE
    this.currentUser = null
    this.daxDuckDexInstance = null
  }

  init() {
    this.cacheDOM()
    this.bindEvents()
    this.handleAuthReturn()
    this.checkAuthStatus()
    this.daxDuckDexInstance = window.daxDuckDex
  }

  handleAuthReturn() {
    const urlParams = new URLSearchParams(window.location.search)
    const returnTo = urlParams.get("returnTo")
    const isAuthReturn =
      urlParams.has("code") ||
      urlParams.has("state") ||
      window.location.hash === "#_"

    if (isAuthReturn) {
      const cleanUrl = window.location.pathname
      window.history.replaceState(null, "", cleanUrl)

      if (returnTo === "submit") {
        setTimeout(() => {
          const submitLink = document.querySelector('a[data-section="submit"]')
          if (submitLink) submitLink.click()
        }, 100)
      }
    }
  }

  async checkAuthStatus() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/user`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        if (data.user) {
          this.currentUser = data.user
          this.showUserInfo()
          return
        }
      }
      this.showLoginForm()
    } catch (error) {
      console.log("Not authenticated")
      this.showLoginForm()
    }
  }

  async initiateLogin() {
    try {
      const cleanUrl = `${window.location.origin}${window.location.pathname}?returnTo=submit`
      const returnUrl = encodeURIComponent(cleanUrl)
      window.location.href = `${this.apiBaseUrl}/auth/reddit?returnUrl=${returnUrl}`
    } catch (error) {
      console.error("Login error:", error)
      this.showError("Failed to initiate login. Please try again.")
    }
  }

  async logout() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        this.currentUser = null
        this.showLoginForm()
        this.hideForm()
      }
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  cacheDOM() {
    this.dom = {
      submitSection: document.getElementById("submit-section"),
      loginCard: document.getElementById("loginCard"),
      userCard: document.getElementById("userCard"),
      redditLoginBtn: document.getElementById("redditLoginBtn"),
      username: document.getElementById("username"),
      userKarma: document.getElementById("userKarma"),
      userBadge: document.getElementById("userBadge"),
      logoutBtn: document.getElementById("logoutBtn"),
      submissionForm: document.getElementById("submissionForm"),
      characterForm: document.getElementById("characterForm"),
      characterName: document.getElementById("characterName"),
      additionalInfo: document.getElementById("additionalInfo"),
      submitBtn: document.getElementById("submitBtn"),
      submissionStatus: document.getElementById("submissionStatus"),
      successStatus: document.getElementById("successStatus"),
      errorStatus: document.getElementById("errorStatus"),
      errorMessage: document.getElementById("errorMessage"),
      submitAnotherBtn: document.getElementById("submitAnotherBtn"),
      retryBtn: document.getElementById("retryBtn"),
    }
  }

  bindEvents() {
    if (this.dom.redditLoginBtn) {
      this.dom.redditLoginBtn.addEventListener("click", (e) => {
        e.preventDefault()
        this.initiateLogin()
      })
    }
    if (this.dom.logoutBtn) {
      this.dom.logoutBtn.addEventListener("click", () => this.logout())
    }

    if (this.dom.characterForm) {
      this.dom.characterForm.addEventListener("submit", (e) =>
        this.handleSubmit(e),
      )
      this.dom.characterForm.addEventListener("reset", () => this.resetForm())
    }

    if (this.dom.submitAnotherBtn) {
      this.dom.submitAnotherBtn.addEventListener("click", () => this.showForm())
    }
    if (this.dom.retryBtn) {
      this.dom.retryBtn.addEventListener("click", () => this.showForm())
    }
  }

  showUserInfo() {
    if (this.dom.loginCard) this.dom.loginCard.style.display = "none"
    if (this.dom.userCard) this.dom.userCard.classList.remove("hidden")
    if (this.dom.submissionForm)
      this.dom.submissionForm.classList.remove("hidden")
    if (this.dom.submitBtn) this.dom.submitBtn.disabled = false

    if (this.dom.username && this.currentUser) {
      this.dom.username.textContent = `u/${this.currentUser.name || this.currentUser.username}`
    }
    if (this.dom.userKarma && this.currentUser) {
      this.dom.userKarma.textContent = `${this.currentUser.karma || 0} karma`
    }
    if (this.dom.userBadge && this.currentUser) {
      this.dom.userBadge.textContent = `Logged as u/${this.currentUser.name || this.currentUser.username}`
      this.dom.userBadge.style.display = "inline-flex"
    }
  }

  showLoginForm() {
    if (this.dom.loginCard) this.dom.loginCard.style.display = ""
    if (this.dom.userCard) this.dom.userCard.classList.add("hidden")
    if (this.dom.submissionForm) this.dom.submissionForm.classList.add("hidden")
    if (this.dom.submitBtn) this.dom.submitBtn.disabled = true
    if (this.dom.userBadge) this.dom.userBadge.style.display = "none"
  }

  async handleSubmit(e) {
    e.preventDefault()

    if (!this.currentUser) {
      this.showError("Please log in to submit characters.")
      return
    }

    const characterName = this.dom.characterName.value.trim()
    const additionalInfo = this.dom.additionalInfo.value.trim()

    if (!characterName) {
      this.showError("Please enter a character name.")
      return
    }

    const existingCharacter = this.checkCharacterExists(characterName)
    if (existingCharacter) {
      this.showError(
        `"${characterName}" already exists in our database! ` +
          `It was discovered by ${existingCharacter.discoverer || "Unknown"} ` +
          `${existingCharacter.discovered_date ? `on ${this.formatDate(existingCharacter.discovered_date)}` : ""}.`,
      )
      return
    }

    this.setSubmitLoading(true)

    const ddgExists = await this.checkDuckDuckGoExists(characterName)
    if (!ddgExists) {
      this.setSubmitLoading(false)
      this.showError(
        `"${characterName}" was not found on DuckDuckGo. ` +
          `Please check the spelling or try a different variation.`,
      )
      return
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/submit/character`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          characterName,
          additionalInfo,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        this.showSuccess()
      } else {
        this.showError(data.message || data.error || "Submission failed")
      }
    } catch (error) {
      console.error("Submission error:", error)
      this.showError(
        "Network error. Please check your connection and try again.",
      )
    } finally {
      this.setSubmitLoading(false)
    }
  }

  setSubmitLoading(loading) {
    const btnText = this.dom.submitBtn?.querySelector(".btn-text")
    const btnLoading = this.dom.submitBtn?.querySelector(".btn-loading")

    if (loading) {
      if (btnText) btnText.classList.add("hidden")
      if (btnLoading) btnLoading.classList.remove("hidden")
      if (this.dom.submitBtn) this.dom.submitBtn.disabled = true
    } else {
      if (btnText) btnText.classList.remove("hidden")
      if (btnLoading) btnLoading.classList.add("hidden")
      if (this.dom.submitBtn) this.dom.submitBtn.disabled = false
    }
  }

  showSuccess() {
    if (this.dom.submissionForm) this.dom.submissionForm.classList.add("hidden")
    if (this.dom.submissionStatus)
      this.dom.submissionStatus.classList.remove("hidden")
    if (this.dom.successStatus)
      this.dom.successStatus.classList.remove("hidden")
    if (this.dom.errorStatus) this.dom.errorStatus.classList.add("hidden")

    this.resetForm()
  }

  showError(message) {
    if (this.dom.submissionStatus)
      this.dom.submissionStatus.classList.remove("hidden")
    if (this.dom.errorStatus) this.dom.errorStatus.classList.remove("hidden")
    if (this.dom.successStatus) this.dom.successStatus.classList.add("hidden")
    if (this.dom.errorMessage) this.dom.errorMessage.textContent = message
  }

  showForm() {
    if (this.dom.submissionForm)
      this.dom.submissionForm.classList.remove("hidden")
    if (this.dom.submissionStatus)
      this.dom.submissionStatus.classList.add("hidden")
  }

  hideForm() {
    if (this.dom.submissionForm) this.dom.submissionForm.classList.add("hidden")
    if (this.dom.submissionStatus)
      this.dom.submissionStatus.classList.add("hidden")
  }

  resetForm() {
    if (this.dom.characterForm) {
      this.dom.characterForm.reset()
    }
  }

  checkCharacterExists(characterName) {
    if (!this.daxDuckDexInstance || !this.daxDuckDexInstance.allCharacters) {
      console.warn("DaxDuckDex data not available for duplicate check")
      return null
    }

    const normalizedInput = characterName.toLowerCase().trim()

    return this.daxDuckDexInstance.allCharacters.find((character) => {
      const normalizedExisting = character.name.toLowerCase().trim()
      return normalizedExisting === normalizedInput
    })
  }

  async checkDuckDuckGoExists(characterName) {
    try {
      // Normalize character name for DuckDuckGo URL format
      const normalizedName = characterName
        .toLowerCase()
        .replace(/ñ/g, "n") // ñ → n (Vuelta a España → espana)
        .replace(/'/g, "") // ' → nothing (Giro d'Italia → ditalia)
        .replace(/'/g, "") // ' → nothing (smart quotes)
        .replace(/'/g, "") // ' → nothing (other apostrophe variants)
        .replace(/\s+/g, "_") // spaces → underscores
        .replace(/[^\w_]/g, "") // remove other special characters

      const logoUrl = `https://duckduckgo.com/dist/logos/dynamic/${normalizedName}.png`

      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = logoUrl

        setTimeout(() => resolve(false), 5000)
      })
    } catch (error) {
      console.error("Error checking DuckDuckGo:", error)
      return false
    }
  }

  formatDate(dateString) {
    if (!dateString) return ""
    const date = new Date(dateString)
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
    return date.toLocaleDateString("en-US", options)
  }
}

// Initialize the app
const daxDuckDex = new DaxDuckDex()
const redditManager = new RedditSubmissionManager()

window.daxDuckDex = daxDuckDex

// Initialize both components when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  redditManager.init()
})
