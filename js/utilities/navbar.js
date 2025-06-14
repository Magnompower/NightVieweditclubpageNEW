import {arrayUnion, db, doc, getDownloadURL, getStorage, ref, updateDoc} from '/js/api/firebase-api.js';
import {
    cacheLocation,
    clearSession,
    getCachedLocation,
    getClubSession,
    getSession,
    saveClubSession
} from "/js/utilities/session.js";
import {getAllVisibleLocations, isDataInitialized} from "/js/utilities/global.js";
import {toTitleCase} from "/js/utilities/utility.js";
import {getLocationData} from "/js/utilities/EuropeanLocationMapper.js";
import {databaseCollections} from "/js/utilities/constants.js";

class NavBar extends HTMLElement {
    connectedCallback() {
        const isLoginPage = window.location.pathname.includes('index.html');

        // Render navbar structure immediately
        this.innerHTML = `
            <nav>
                <div class="navbar-logo">
                    <a href="https://night-view.dk/" target="_blank">
                        <img id="navbar-logo" src="/images/nightview/logo_text.png" alt="Logo">
                    </a>
                </div>
                ${!isLoginPage ? `
                <ul class="anchor-container">
                    <li><a href="/club-overview.html">Location Data</a></li>
                    <li><a href="/notifications.html">Notifications</a></li>
                    <li><a href="/user-data.html">User Data</a></li>
                    <li class="admin-link" style="display:none;"><a href="/admin-page.html">Admin</a></li>
                </ul>
                <ul class="selector-container">
                    <li>
                        <div id="club-dropdown" class="dropdown">
                            <button class="dropdown-toggle">Clubs</button>
                            <div id="club-menu" class="dropdown-menu hidden"></div>
                        </div>
                    </li>
                    <li>
                        <select id="user-selector">
                            <option disabled selected>Staff</option>
                        </select>
                    </li>
                </ul>` : ''}
                <div class="navbar-right">
                    <ul id="navbar-right-column">
                        ${!isLoginPage ? `
                        <li class="profile-pic-item" style="display:none;">
                            <img id="profile-pic" src="/images/users/default_user_pb.jpg" alt="Profile Picture">
                        </li>` : ''}
                        <li>
                            <img id="language-flag" src="/images/flags/uk.png" alt="Language" class="lang-flag">
                        </li>
                    </ul>
                </div>
            </nav>
            ${!isLoginPage ? `
            <div id="profile-dropdown" class="profile-dropdown hidden">
                <ul>
                    <li id="logout-button">Log out</li>
                </ul>
            </div>
            <div id="add-staff-modal" class="modal-overlay hidden">
                <div class="modal-content">
                    <button class="close-button">×</button>
                    <h2>Add Staff Member</h2>
                    <input type="text" id="staff-search" placeholder="Search by email..." />
                    <div id="search-results"></div>
                </div>
            </div>
            <style>
                .dropdown {
                    position: relative;
                    display: inline-block;
                }
                .dropdown-toggle {
                    background-color: var(--color-black);
                    color: var(--color-white);
                    border: 1px solid var(--night-view-green);
                    padding: 0.4em 1em;
                    border-radius: 5px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    align-items: center;
                }
                .dropdown-toggle:hover {
                    background-color: var(--night-view-purple);
                    color: var(--color-white);
                }
                .dropdown-toggle:focus {
                    outline: none;
                    border-color: var(--color-white);
                    box-shadow: 0 0 0 2px var(--night-view-green);
                }
                .dropdown-menu {
                    position: absolute;
                    top: 100%;
                    left: -400px;
                    background-color: var(--color-black);
                    border: 1px solid var(--night-view-green);
                    border-radius: 5px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    min-width: 350px;
                    z-index: 1000;
                    max-height: 700px;
                    overflow-y: auto;
                }
                .dropdown-menu::-webkit-scrollbar {
                    width: 4px;
                }
                .dropdown-menu::-webkit-scrollbar-thumb {
                    background-color: var(--night-view-green);
                    border-radius: 10px;
                }
                .dropdown-menu::-webkit-scrollbar-track {
                    background: transparent;
                }
                .dropdown-item {
                padding-top: 8px;
                      text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
                    cursor: pointer;
                    color: var(--color-white);
                    font-weight: bold;
                }
                .dropdown-item:hover {
                    background-color: var(--night-view-purple);
                    color: var(--color-white);
                }
                .dropdown-item.add-new {
                    color: var(--night-view-green);
                    font-weight: bold;
                }
                .dropdown-header {
                    padding: 8px 16px;
                    font-weight: bold;
                    color: var(--color-white);
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .dropdown-header:hover {
                    background-color: var(--night-view-purple);
                    color: var(--color-white);
                }
                .club-list {
                    display: none;
                    padding-left: 16px;
                }
                .club-list .dropdown-item {
    white-space: nowrap;
}
                .toggle-arrow::before {
                    content: '▶';
                    margin-right: 8px;
                }
                .toggle-arrow.open::before {
                    content: '▼';
                }
                .profile-dropdown {
                    color: var(--night-view-green);
                    position: absolute;
                    top: 120px;
                    right: 20px;
                    border: 1px solid #ddd;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    width: 8vw;
                    z-index: 999;
                    background-color: var(--color-black);
                }
                .profile-dropdown ul {
                    list-style: none;
                    margin: 0;
                    padding: 10px 0;
                }
                .profile-dropdown li {
                    padding: 10px 20px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: large;
                    color: var(--color-white);
                }
                .profile-dropdown li:hover {
                    background-color: var(--night-view-purple);
                    color: var(--color-white);
                }
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background-color: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: white;
                    padding: 2em;
                    border-radius: 10px;
                    max-width: 600px;
                    width: 100%;
                    position: relative;
                }
                .close-button {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: #e74c3c;
                    border: none;
                    color: white;
                    font-size: 1.5rem;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.3s ease;
                }
                .close-button:hover {
                    background: #c0392b;
                }
                #search-results {
                    margin-top: 1em;
                    max-height: 200px;
                    overflow-y: auto;
                }
                .search-result-item {
                    padding: 0.5em;
                    border-bottom: 1px solid #eee;
                    cursor: pointer;
                }
                .search-result-item:hover {
                    background-color: #f0f0f0;
                }
                .status-message {
                    padding: 1rem;
                    border-radius: 8px;
                    margin: 0.5rem 0;
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                }
                .info-message {
                    background: #e3f2fd;
                    color: #1976d2;
                    border: 1px solid #90caf9;
                }
                .warning-message {
                    background: #fff3e0;
                    color: #ef6c00;
                    border: 1px solid #ffb74d;
                }
                .error-message {
                    background: #ffebee;
                    color: #d32f2f;
                    border: 1px solid #ef9a9a;
                }
                .suggestion {
                    font-size: 0.9em;
                    margin-top: 0.5rem;
                    color: inherit;
                    opacity: 0.8;
                }
                .result-count {
                    font-size: 0.9rem;
                    color: #666;
                    margin-bottom: 1rem;
                    padding-bottom: 0.5rem;
                    border-bottom: 1px solid #eee;
                }
                .user-email {
                    font-weight: 500;
                    color: #2c3e50;
                }
                .user-name {
                    font-size: 0.9em;
                    color: #7f8c8d;
                    margin-top: 0.3rem;
                }
                .search-result-item:hover .user-email {
                    color: white;
                }
                .search-result-item:hover .user-name {
                    color: rgba(255,255,255,0.8);
                }
                .hidden {
                    display: none;
                }
            </style>` : ''}`;

        if (!isLoginPage) {
            // Attach event listeners immediately
            const clubDropdownToggle = this.querySelector('.dropdown-toggle');
            const clubMenu = this.querySelector('#club-menu');

            clubDropdownToggle.addEventListener('click', () => {
                clubMenu.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!this.querySelector('#club-dropdown').contains(e.target)) {
                    clubMenu.classList.add('hidden');
                }
            });

            const profilePic = this.querySelector('#profile-pic');
            const dropdown = this.querySelector('#profile-dropdown');
            const logoutButton = this.querySelector('#logout-button');
            const modal = this.querySelector('#add-staff-modal');
            const closeButton = this.querySelector('.close-button');
            const searchInput = this.querySelector('#staff-search');

            profilePic.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!this.contains(e.target)) {
                    dropdown.classList.add('hidden');
                }
            });

            logoutButton.addEventListener('click', () => {
                clearSession();
                window.location.href = '/index.html';
            });

            closeButton.addEventListener('click', () => {
                modal.classList.add('hidden');
            });

            searchInput.addEventListener('input', (e) => {
                this.searchUsers(e.target.value);
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });

            // Populate dynamic content asynchronously
            const initializeNavbar = async () => {
                const uid = getSession().uid;
                await this.populateClubSelector(uid);
                this.updateProfilePicture(uid); // Non-blocking
                this.updateNavbarVisibility(isLoginPage);
            };

            if (isDataInitialized()) {
                initializeNavbar();
            } else {
                window.addEventListener('dataInitialized', initializeNavbar, { once: true });
            }
        }
    }

    async populateClubSelector(uid) {
        const menu = this.querySelector('#club-menu');
        let firstValidClubId = null;

        if (getAllVisibleLocations().length === 0) {
            await new Promise(resolve => window.addEventListener('dataInitialized', resolve, {once: true}));
        }

        const validClubs = getAllVisibleLocations().map(club => ({
            id: club.id,
            name: club.displayName || toTitleCase(club.name) || club.id,
            lat: club.lat,
            lon: club.lon
        }));

        // Fetch location data for each club
        const clubDataPromises = validClubs.map(async (club) => {
            const cacheKeyCity = `club_${club.id}_city`;
            const cacheKeyCountry = `club_${club.id}_country`;
            let city = getCachedLocation(cacheKeyCity);
            let country = getCachedLocation(cacheKeyCountry);

            if (!city || !country) {
                try {
                    const locationData = await getLocationData(club.lat, club.lon);
                    city = locationData.city;
                    country = locationData.country;
                    cacheLocation(cacheKeyCity, city);
                    cacheLocation(cacheKeyCountry, country);
                } catch (error) {
                    console.error(`Failed to get location for club ${club.id}:`, error);
                    city = 'Unknown city';
                    country = 'Unknown country';
                }
            }
            return {...club, city, country};
        });

        const clubsWithLocation = await Promise.all(clubDataPromises);

        // Group clubs by country > city
        const countries = {};
        clubsWithLocation.forEach(club => {
            const country = club.country || 'Unknown country';
            const city = club.city || 'Unknown city';
            if (!countries[country]) countries[country] = {};
            if (!countries[country][city]) countries[country][city] = [];
            countries[country][city].push(club);
        });

        menu.innerHTML = '';

        const addClubItem = document.createElement('div');
        addClubItem.className = 'dropdown-item add-new';
        const isAdmin = getSession().role === 'admin';
        const approvedClubCount = getAllVisibleLocations().length;
        const newClubCount = 0; // TODO: find all in newClubs
        addClubItem.textContent = isAdmin
            ? `➕ Add Location (${approvedClubCount}${newClubCount > 0 ? ' + ' + newClubCount : ''})`
            : '➕ Add Location';
        addClubItem.addEventListener('click', () => {
            this.selectedClubId = 'add-new';
            saveClubSession('add-new');
            window.dispatchEvent(new Event('clubChanged'));
        });
        menu.appendChild(addClubItem);

        // Create nested dropdown structure
        Object.keys(countries).sort().forEach(country => {
            const countryDiv = document.createElement('div');
            const countryHeader = document.createElement('div');
            countryHeader.className = 'dropdown-header';
            countryHeader.innerHTML = `<span class="toggle-arrow">${country}</span>`;
            const cityList = document.createElement('div');
            cityList.className = 'club-list';

            Object.keys(countries[country]).sort().forEach(city => {
                const cityDiv = document.createElement('div');
                const cityHeader = document.createElement('div');
                cityHeader.className = 'dropdown-header';
                cityHeader.innerHTML = `<span class="toggle-arrow">${city}</span>`;
                const clubList = document.createElement('div');
                clubList.className = 'club-list';

                countries[country][city]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(club => {
                        const clubItem = document.createElement('div');
                        clubItem.className = 'dropdown-item';
                        clubItem.textContent = club.name;
                        clubItem.addEventListener('click', () => {
                            this.selectedClubId = club.id;
                            saveClubSession(club.id);
                            this.populateUserSelector(club.id);
                            window.dispatchEvent(new Event('clubChanged'));
                            menu.classList.add('hidden');
                        });
                        clubList.appendChild(clubItem);
                        if (!firstValidClubId) firstValidClubId = club.id;
                    });

                cityDiv.appendChild(cityHeader);
                cityDiv.appendChild(clubList);
                cityList.appendChild(cityDiv);
            });

            countryDiv.appendChild(countryHeader);
            countryDiv.appendChild(cityList);
            menu.appendChild(countryDiv);

            // Toggle city visibility
            countryHeader.addEventListener('click', (e) => {
                e.stopPropagation();
                const arrow = countryHeader.querySelector('.toggle-arrow');
                const isOpen = cityList.style.display === 'block';
                cityList.style.display = isOpen ? 'none' : 'block';
                arrow.classList.toggle('open', !isOpen);
            });

            // Toggle club visibility within city
            cityList.querySelectorAll('.dropdown-header').forEach(cityHeader => {
                const clubList = cityHeader.nextElementSibling;
                cityHeader.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const arrow = cityHeader.querySelector('.toggle-arrow');
                    const isOpen = clubList.style.display === 'block';
                    clubList.style.display = isOpen ? 'none' : 'block';
                    arrow.classList.toggle('open', !isOpen);
                });
            });
        });

        const storedClubId = getClubSession();
        if (storedClubId && clubsWithLocation.find(club => club.id === storedClubId)) {
            this.selectedClubId = storedClubId;
            this.populateUserSelector(storedClubId);
        } else if (firstValidClubId) {
            this.selectedClubId = firstValidClubId;
            saveClubSession(firstValidClubId);
            this.populateUserSelector(firstValidClubId);
            window.dispatchEvent(new Event('clubChanged'));
        }
    }

    async populateUserSelector(clubId) {
        if (window.location.pathname.includes('index.html')) return;

        const userSelector = this.querySelector('#user-selector');
        userSelector.innerHTML = '<option disabled selected>Staff</option>';

        if (!['admin', 'owner'].includes(this.userRole)) return;

        const addUserOption = document.createElement('option');
        addUserOption.value = 'add-staff';
        addUserOption.textContent = '➕ Add Staff';
        userSelector.appendChild(addUserOption);

        if (!clubId || clubId === 'add-new') return;

        const club = getAllVisibleLocations().find(c => c.id === clubId);
        if (!club) return;

        const ownerIds = new Set(club.owners || []);
        const staffIds = new Set(club.staff || []);

        const users = (window.userCache || []).filter(user =>
            ownerIds.has(user.id) || staffIds.has(user.id)
        );

        users.sort((a, b) => {
            const aIsOwner = ownerIds.has(a.id);
            const bIsOwner = ownerIds.has(b.id);
            if (aIsOwner && !bIsOwner) return -1;
            if (!aIsOwner && bIsOwner) return 1;
            return a.email.localeCompare(b.email);
        });

        users.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            const label = ownerIds.has(user.id) ? '👑 Owner' : '👤 Staff';
            opt.textContent = `${user.email} (${label}${user.name ? ` – ${user.name}` : ''})`;
            userSelector.appendChild(opt);
        });

        userSelector.selectedIndex = 0;

        if (!userSelector.dataset.listenerAttached) {
            userSelector.addEventListener('change', (event) => {
                if (event.target.value === 'add-staff') {
                    this.showAddStaffModal();
                    setTimeout(() => userSelector.selectedIndex = 0, 0);
                }
            });
            userSelector.dataset.listenerAttached = "true";
        }
    }

    showAddStaffModal() {
        console.log('showAddStaffModal called. Club ID:', this.selectedClubId);
        const clubId = this.selectedClubId;
        if (!clubId || clubId === 'add-new') {
            showAlert({
                title: 'No Location Selected',
                text: 'Please select a club first.',
                icon: swalTypes.warning
            });
            return;
        }

        const modal = this.querySelector('#add-staff-modal');
        const searchInput = this.querySelector('#staff-search');
        const searchResults = this.querySelector('#search-results');

        searchInput.value = '';
        searchResults.innerHTML = '';
        modal.classList.remove('hidden');
        searchInput.focus();
    }

    async searchUsers(query) {
        const searchResults = this.querySelector('#search-results');
        searchResults.innerHTML = '';
        const clubId = this.selectedClubId;

        if (!query.trim()) {
            searchResults.innerHTML = '<div class="info-message">Start typing to search for staff members</div>';
            return;
        }

        if (!clubId) return;

        try {
            if (!window.userCache) {
                console.error("User cache not loaded");
                return;
            }

            const club = getAllVisibleLocations().find(c => c.id === clubId);
            const existingStaff = new Set([...(club?.staff || []), ...(club?.owners || [])]);

            searchResults.innerHTML = '<div class="info-message">Searching...</div>';
            await new Promise(resolve => setTimeout(resolve, 200));

            const matchingUsers = window.userCache.filter(user => {
                const emailMatch = user.email?.toLowerCase().includes(query.toLowerCase());
                const exactMatch = user.email?.toLowerCase() === query.toLowerCase();
                return emailMatch && !existingStaff.has(user.id) && exactMatch;
            });

            searchResults.innerHTML = '';

            if (query.length < 3) {
                searchResults.innerHTML = '<div class="warning-message">Type at least 3 characters to search</div>';
                return;
            }

            if (matchingUsers.length === 0) {
                searchResults.innerHTML = `
                <div class="error-message">
                    No users found for "${query}"
                    <div class="suggestion">Check for typos or try a different email</div>
                </div>`;
                return;
            }

            const countBadge = document.createElement('div');
            countBadge.className = 'result-count';
            countBadge.textContent = `${matchingUsers.length} ${matchingUsers.length === 1 ? 'match' : 'matches'} found`;
            searchResults.appendChild(countBadge);

            matchingUsers.forEach(user => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                const email = user.email;
                const matchIndex = email.toLowerCase().indexOf(query.toLowerCase());
                const beforeMatch = email.slice(0, matchIndex);
                const matchText = email.slice(matchIndex, matchIndex + query.length);
                const afterMatch = email.slice(matchIndex + query.length);

                div.innerHTML = `
                <div class="user-email">
                    ${beforeMatch}<strong>${matchText}</strong>${afterMatch}
                </div>
                <div class="user-name">${user.name || 'No name provided'}</div>
            `;
                div.addEventListener('click', () => this.addStaffToClub(user));
                searchResults.appendChild(div);
            });
        } catch (error) {
            console.error("Search error:", error);
            searchResults.innerHTML = '<div class="error-message">Error searching users. Please try again.</div>';
        }
    }

    createStatusMessage(text, type = 'info') {
        const message = document.createElement('div');
        message.className = `status-message ${type}-message`;
        message.innerHTML = `
            <span class="status-icon">${this.getStatusIcon(type)}</span>
            ${text}
        `;
        return message;
    }

    getStatusIcon(type) {
        const icons = {
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌',
            success: '✅'
        };
        return icons[type] || '';
    }

    async addStaffToClub(user) {
        const clubId = this.selectedClubId;
        if (!clubId) {
            showAlert({
                title: 'No Location Selected',
                text: 'Please select a club first.',
                icon: swalTypes.warning
            });

            return;
        }

        try {
            const clubDocRef = doc(db, databaseCollections.clubData, clubId);
            await updateDoc(clubDocRef, {
                staff: arrayUnion(user.id)
            });

            const club = getAllVisibleLocations().find(c => c.id === clubId);
            if (club) {
                club.staff = [...(club.staff || []), user.id];
            }

            showAlert({
                title: 'Staff Added!',
                text: `Successfully added ${user.email} as staff!`,
                icon: swalTypes.success
            });
            this.querySelector('#add-staff-modal').classList.add('hidden');
            this.populateUserSelector(clubId);
        } catch (error) {
            console.error("Add staff error:", error);
            showAlert({
                title: 'Add Staff Failed',
                text: 'Failed to add staff member.',
                icon: swalTypes.error
            });
        }
    }

    async updateProfilePicture(uid) {
        const cachedUrl = sessionStorage.getItem(`profilePic_${uid}`); // TODO Move to session
        const pic = this.querySelector('#profile-pic');
        if (cachedUrl && pic) {
            pic.src = cachedUrl;
            return;
        }

        const storage = getStorage();
        const imageRef = ref(storage, `pb/${uid}.jpg`);
        try {
            const url = await getDownloadURL(imageRef);
            if (pic) {
                pic.src = url;
                sessionStorage.setItem(`profilePic_${uid}`, url); // Cache the URL //TODO move to session.
            }
        } catch (e) {
            console.log("Using default profile picture: " + e);
        }
    }

    updateNavbarVisibility(isLoginPage) {
        const adminLink = this.querySelector('.admin-link');
        const profilePicItem = this.querySelector('.profile-pic-item');

        if (adminLink) adminLink.style.display = getSession().role === 'admin' && !isLoginPage ? 'list-item' : 'none';
        if (profilePicItem) profilePicItem.style.display = !isLoginPage ? 'list-item' : 'none';
    }

    get ready() {
        return this._ready;
    }
}

customElements.define('nav-bar', NavBar);