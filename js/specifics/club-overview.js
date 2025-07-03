import {
    analytics,
    collection,
    db,
    doc,
    GeoPoint,
    getDoc,
    getDocs,
    getDownloadURL,
    logEvent,
    ref,
    refreshClubDataInCache,
    serverTimestamp,
    setDoc,
    storage,
    updateNewLocations,
    uploadImageToFirestore,
    uploadBytes
} from "/js/api/firebase-api.js";
import {
    CLUB_TYPES_ENGLISH,
    databaseCollections,
    databaseStorage,
    days,
    swalTypes
} from "/js/utilities/constants.js";
import {getAllVisibleLocations, isDataInitialized, setAllVisibleLocations} from "/js/utilities/global.js";
import {checkSession, getClubSession, getSession} from "/js/utilities/session.js";
import {updateIPhoneDisplay} from "/js/specifics/iphone-display-updater.js";
import {FontSelector} from "/js/utilities/fontselector.js";
import {convertToWebP, formatGeoCoord, getTodayKey, nameFormatter, toTitleCase} from "/js/utilities/utility.js";
import {showAlert} from "/js/utilities/custom-alert.js";
import {hideLoading, showLoading} from "/js/utilities/loading-indicator.js";

export let mainOfferImgUrl;
let localClubData;
let localOfferImages = {};

let originalDbData;
let originalLogoUrl;
let originalMainOfferImgUrl;
let pendingLogoBlob = null;
let pendingLogoFilename = null;

let cornerCount = 4;

const TEST_STATUS = true; // TEST
// const TEST_STATUS = false; // TEST

document.addEventListener("DOMContentLoaded", async () => {
    if (!checkSession()) {
        window.location.href = "/index.html";
        return;
    }

    const initialize = async () => {
        const clubId = getClubSession();
        if (clubId) {
            await loadData(clubId);
        }
    };

    if (isDataInitialized()) {
        await initialize();
    } else {
        window.addEventListener('dataInitialized', initialize, {once: true});
    }

    document.getElementById("addCornerBtn").addEventListener("click", () => {
        cornerCount++;
        const container = document.getElementById("corners-container");

        const fieldDiv = document.createElement("div");
        fieldDiv.className = "field-item";

        const label = document.createElement("label");
        label.setAttribute("for", `corner${cornerCount}`);
        label.textContent = `Corner ${cornerCount} (lat, lon)`;

        const input = document.createElement("input");
        input.type = "text";
        input.id = `corner${cornerCount}`;
        input.placeholder = "e.g., 45.1, 58.1";
        input.pattern = "^-?\\d+(\\.\\d+)?\\s*,\\s*-?\\d+(\\.\\d+)?$";

        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);

        container.insertBefore(fieldDiv, document.getElementById("addCornerBtn"));
    });
});

logEvent(analytics, "page_view");

function fetchStorageUrl(path, fallbackUrl = "/images/default_image.png") {
    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef)
        .then((url) => url)
        .catch((error) => {
            console.warn(`Could not fetch ${path}: ${error.message}`);
            return fallbackUrl; // Use a valid default image
        });
}

async function fetchStorageUrlQuickFix(basePath, fileName, selectedClubId, fallbackUrl = selectedClubId ) {
    const variations = [
        selectedClubId, // Exact as provided
        selectedClubId.toLowerCase(), // All lowercase
        selectedClubId.charAt(0).toUpperCase() + selectedClubId.slice(1).toLowerCase() // Title-cased
    ];

    for (const variation of variations) {
        const path = `${basePath}/${variation}/${fileName}`;
        try {
            const url = await getDownloadURL(ref(storage, path));
            return url;
        } catch (error) {
            console.warn(`Could not fetch ${path}: ${error.message}`);
        }
    }
    return fallbackUrl; // Return fallback if all variations fail
}

async function loadData(selectedClubId, updateNeeded = TEST_STATUS) {
    console.log("selectedClubId: ", selectedClubId);
    if (selectedClubId === "add-new") {
        prepareNewClubForm();
        return;
    }

    try {
        let clubs = getAllVisibleLocations();
        if (!clubs) {
            const querySnapshot = await getDocs(collection(db, databaseCollections.clubData));
            clubs = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            }));
            setAllVisibleLocations(clubs);
            console.log("Fetched fresh clubDataCache:", clubs);
        } else if (updateNeeded) {
            await refreshClubDataInCache(selectedClubId);
            clubs = getAllVisibleLocations();
            console.log(`Updated and refreshed cache for club ID: ${selectedClubId}`);
        } else {
            console.log("Using cached clubData:", clubs);
        }

        const club = getAllVisibleLocations().find(club => club.id === selectedClubId);
        if (!club) {
            console.log(`Club with ID ${selectedClubId} not found or not authorized.`);
            showAlert({
                title: 'Access Denied',
                text: 'You do not have permission to view this Location.',
                icon: swalTypes.error
            });
            return;
        }

        const logoUrl = await fetchStorageUrl(`club_logos/${club.logo}`, "/images/default_logo.png");


        // // Ensure banner_image is always set
        const bannerImage = {
            previewUrl: await fetchStorageUrlQuickFix(
                databaseStorage.clubImages,
                "cover_image.webp",
                selectedClubId,
                "/images/default_banner.png"
            ),
            name: "cover_image"
        };

        const locationImages = await Promise.all((club.location_images || []).map(async (imgName, i) => {
            const fullPath = `${databaseStorage.clubImages}/${selectedClubId}/mood_images_stock/${imgName}`;
            try {
                const previewUrl = await fetchStorageUrl(fullPath, "/images/default_mood.png");
                console.log(`✅ Loaded ${imgName}`, previewUrl);
                return { previewUrl, name: imgName };
            } catch (error) {
                console.warn(`❌ Failed to load ${imgName}: ${error.message}`);
                return { previewUrl: "/images/default_mood.png", name: imgName };
            }
        }));


        // // Ensure barcard is always set
        const barcard = {
            previewUrl: await fetchStorageUrlQuickFix(
                databaseStorage.clubImages,
                "barcard.pdf",
                selectedClubId,
                null // No fallback for PDF
            ),
            name: "barcard.pdf"
        };

        localClubData = {
            ...club,
            logo: logoUrl,
            opening_hours: {...(club.opening_hours || {})},
            tags: Array.isArray(club.tags) ? club.tags.map(String) : [],
            banner_image: bannerImage,
            location_images: locationImages,
            barcard: barcard,
            description: club.description || ""
        };

        if (!club.main_offer_img) {
            mainOfferImgUrl = null;
        } else {
            try {
                mainOfferImgUrl = await fetchStorageUrl(
                    `main_offers/${club.main_offer_img}`,
                    null
                );
            } catch (e) {
                console.warn("Failed to fetch main offer; skipping.", e);
                mainOfferImgUrl = null;
            }
        }


        const clubData = {
            name: club.name || "Unknown Club",
            logo: logoUrl,
            ageRestriction: club.age_restriction && club.age_restriction >= 16
                ? `${club.age_restriction}+`
                : "Unknown age restriction",
            openingHours: formatOpeningHours(club.opening_hours),
            distance: "300 m",
            isFavorite: true,
            typeOfClub: club.type_of_club || "unknown",
        };

        originalDbData = { ...club };
        originalLogoUrl = clubData.logo;
        originalMainOfferImgUrl = mainOfferImgUrl;

        const clubNameH1 = document.querySelector(".header-title");
        if (clubNameH1) clubNameH1.textContent = toTitleCase(clubData.name);

        const clubLogoImg = document.getElementById("clubLogoImg");
        if (clubLogoImg) {
            clubLogoImg.src = clubData.logo || "";
            clubLogoImg.addEventListener("click", () => {
                if (!clubData.logo || isDefaultLogo(clubLogoImg.src)) {
                    uploadNewLogo(selectedClubId, clubLogoImg);
                } else {
                    showLogoPopup(selectedClubId, clubLogoImg);
                }
            });
        }

        const clubTypeImg = document.getElementById("clubTypeImg");
        if (clubTypeImg) {
            clubTypeImg.src = club.type_of_club
                ? `/images/clubtype/${club.type_of_club}_icon.png`
                : "/images/default_type.png";
        }

        const clubNameInput = document.getElementById("clubNameInput");
        if (clubNameInput) clubNameInput.value = clubData.name;

        const clubDisplayName = document.getElementById("clubDisplayName");
        if (clubDisplayName) clubDisplayName.value = club.displayName || clubData.name;

        const typeOfClubSelect = document.getElementById("typeOfClubSelect");
        if (typeOfClubSelect) {
            typeOfClubSelect.innerHTML = "";
            Object.entries(CLUB_TYPES_ENGLISH).forEach(([dbValue, displayLabel]) => {
                const option = document.createElement("option");
                option.value = dbValue;
                option.textContent = displayLabel;
                typeOfClubSelect.appendChild(option);
            });
            typeOfClubSelect.value = club.type_of_club || "";
        }

        const entranceInput = document.getElementById("entrance");
        if (entranceInput && club.lat != null && club.lon != null) {
            entranceInput.value = `${club.lat}, ${club.lon}`;
        }

        const cornersContainer = document.getElementById("corners-container");
        cornersContainer.querySelectorAll(".field-item").forEach((el, i) => {
            if (i >= 4) el.remove();
        });

        localClubData.corners.forEach((corner, index) => {
            let input = document.getElementById(`corner${index + 1}`);
            if (!input) {
                document.getElementById("addCornerBtn")?.click();
                input = document.getElementById(`corner${index + 1}`);
            }
            if (input && corner?.latitude != null && corner?.longitude != null) {
                input.value = `${formatGeoCoord(corner.latitude)}, ${formatGeoCoord(corner.longitude)}`;
            }
        });

        const maxVisitors = document.getElementById("maxVisitors");
        if (maxVisitors) maxVisitors.value = club.total_possible_amount_of_visitors ?? "";

        const entryPrice = document.getElementById("entryPrice");
        if (entryPrice) entryPrice.value = club.entry_price ?? "0";

        const primaryColor = document.getElementById("primaryColor");
        if (primaryColor) primaryColor.value = club.primary_color ?? "NightView Green";

        const secondaryColor = document.getElementById("secondaryColor");
        if (secondaryColor) secondaryColor.value = club.secondary_color ?? "NightView Black";

        const fontSelect = document.getElementById("font");
        if (fontSelect) {
            const fontSelector = new FontSelector("fontFieldItem", (selectedFont) => {
                localClubData.font = selectedFont;
                syncAndUpdatePreview();
            });
            fontSelect.value = club.font || "NightView Font";
        }

        const clubDescription = document.getElementById("clubDescription");
        if (clubDescription) clubDescription.value = club.description || "";

        days.forEach((day) => {
            const hoursElement = document.getElementById(`${day}-hours`);
            const ageElement = document.getElementById(`${day}-age`);
            const offerButton = document.getElementById(`${day}-offer`);

            const dayHours = club.opening_hours?.[day];
            if (hoursElement) {
                hoursElement.value = dayHours && dayHours.open && dayHours.close
                    ? `${dayHours.open} - ${dayHours.close}`
                    : "Closed";
            }

            const dayAgeRestriction = dayHours?.ageRestriction ?? club.age_restriction;
            if (ageElement) {
                ageElement.value = dayAgeRestriction && dayAgeRestriction >= 18
                    ? `${dayAgeRestriction}+`
                    : "Not set";
            }

            const hasSpecificOffer = !!club.opening_hours?.[day]?.daily_offer;
            const hasMainOffer = !!mainOfferImgUrl;
            if (offerButton) {
                offerButton.textContent = hasSpecificOffer ? "Specific Offer" : hasMainOffer ? "Main Offer" : "Add Offer";
                offerButton.classList.toggle("has-offer", hasSpecificOffer || hasMainOffer);
                offerButton.removeEventListener("click", offerButton._clickHandler);
                offerButton._clickHandler = () => handleOfferAction(day, selectedClubId, offerButton);
                offerButton.addEventListener("click", offerButton._clickHandler);
            }
        });
    } catch (error) {
        console.error("Error loading club data:", error);
        showAlert({
            title: 'Load Error',
            text: 'An error occurred while loading data.',
            icon: swalTypes.error
        });
    }

    try {
        updateImagesSection(selectedClubId);
        setupLivePreviewBindings();
        bindLeftInputs();
        await setupTagSelection();
    } catch (error) {
        console.error("Error loading club data:", error);
        showAlert({
            title: 'Load Error',
            text: 'An error occurred while loading data.',
            icon: swalTypes.error
        });
    }
}

async function setupTagSelection() {
    const tagSelector = document.getElementById("openTagSelector");
    const selectedTagsContainer = document.getElementById("selectedTags");

    if (!tagSelector || !selectedTagsContainer || !localClubData) {
        console.error("Tag selector, selected container or localClubData not available");
        return;
    }

    if (!Array.isArray(localClubData.tags)) {
        localClubData.tags = [];
    }

    let availableTags = [];
    try {
        const tagsSnapshot = await getDocs(collection(db, databaseCollections.clubTags));
        availableTags = tagsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error loading tags", error);
        showAlert({
            title: 'Error',
            text: 'Could not load tags',
            icon: swalTypes.error
        });
        return;
    }

    function renderSelectedTags() {
        selectedTagsContainer.innerHTML = "";
        localClubData.tags.forEach(tagName => {
            const tag = availableTags.find(t => t.name === tagName);
            const tagEl = document.createElement("span");
            tagEl.className = "tag";
            tagEl.textContent = tag ? `${tag.emoji} ${toTitleCase(tagName)}` : toTitleCase(tagName);
            selectedTagsContainer.appendChild(tagEl);
        });
    }

    renderSelectedTags();

    tagSelector.addEventListener("click", (e) => {
        e.preventDefault();

        const existingPopup = document.querySelector(".tag-popup");
        if (existingPopup) {
            existingPopup.remove();
        }

        const popup = document.createElement("div");
        popup.className = "tag-popup";

        const rect = tagSelector.getBoundingClientRect();
        popup.style.top = `${rect.top + window.scrollY}px`;
        popup.style.left = `${rect.right + 10}px`;

        function buildPopupContent() {
            popup.innerHTML = "";

            const sortedTags = [...availableTags].sort((a, b) => {
                const aSelected = localClubData.tags.includes(a.name);
                const bSelected = localClubData.tags.includes(b.name);

                if (aSelected && !bSelected) return -1;
                if (!aSelected && bSelected) return 1;

                return a.name.localeCompare(b.name);
            });

            sortedTags.forEach(tag => {
                const tagEl = document.createElement("div");
                tagEl.className = "tag-option";
                tagEl.textContent = `${tag.emoji} ${toTitleCase(tag.name)}`;
                if (localClubData.tags.includes(tag.name)) {
                    tagEl.classList.add("selected");
                }
                tagEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const index = localClubData.tags.indexOf(tag.name);
                    if (index > -1) {
                        localClubData.tags.splice(index, 1);
                    } else {
                        localClubData.tags.push(tag.name);
                    }
                    renderSelectedTags();
                    syncAndUpdatePreview();
                    buildPopupContent();
                });
                popup.appendChild(tagEl);
            });
        }

        document.body.appendChild(popup);
        buildPopupContent();

        const closePopup = (e) => {
            if (!popup.contains(e.target) && e.target !== tagSelector) {
                popup.remove();
                document.removeEventListener("click", closePopup);
            }
        };
        setTimeout(() => document.addEventListener("click", closePopup), 0);
    });
}

function isDefaultLogo(src) {
    return src.includes("default_logo.png") || !src || src.trim() === "";
}

function showLogoPopup(clubId, logoImgElement) {
    const popup = document.createElement("div");
    popup.className = "offer-popup";

    const header = document.createElement("h3");
    header.className = "popup-header";
    header.textContent = "Club Logo";
    popup.appendChild(header);

    const img = document.createElement("img");
    img.src = logoImgElement.src;
    img.alt = "Club Logo";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "80vh";
    popup.appendChild(img);

    const uploadButton = document.createElement("button");
    uploadButton.textContent = "Change Logo";
    uploadButton.style.backgroundColor = "var(--night-view-green)";
    uploadButton.addEventListener("click", () => uploadNewLogo(clubId, logoImgElement, popup));
    popup.appendChild(uploadButton);

    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.backgroundColor = "white";
    popup.style.padding = "20px";
    popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    popup.style.zIndex = "1000";
    document.body.appendChild(popup);

    syncAndUpdatePreview();
}

function resetData(clubId) {
    if (clubId === "add-new") {
        prepareNewClubForm();
    } else {
        showLoading();
        loadData(clubId);
        hideLoading();
    }
}

async function uploadNewLogo(clubId, logoImgElement, popup) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        try {
            pendingLogoFilename = await getAvailableLogoName(localClubData.name);
            pendingLogoBlob = await convertToWebP(file);

            const tempUrl = URL.createObjectURL(pendingLogoBlob);
            logoImgElement.src = tempUrl;
            localClubData.logo = pendingLogoFilename;
            localClubData.logoPreviewUrl = tempUrl;

            syncClubDataCache(clubId);
            updateImagesSection(clubId);
            if (popup) popup.remove();
            syncAndUpdatePreview();
        } catch (error) {
            console.error("❌ Error preparing logo for deferred upload:", error);
            showAlert({
                title: 'Logo Error',
                text: 'Failed to prepare logo.',
                icon: swalTypes.error
            });
        }
    };
}

function formatOpeningHours(openingHours) {
    if (!openingHours || typeof openingHours !== "object") return "Not set";
    return Object.entries(openingHours)
        .map(([day, hours]) =>
            hours && hours.open && hours.close
                ? `${day}: ${hours.open} - ${hours.close}`
                : `${day}: Closed`
        )
        .join(", ");
}

function syncAndUpdatePreview() {
    const today = getTodayKey();

    localClubData.name = document.getElementById("clubNameInput").value;
    const nameValue = document.getElementById("clubNameInput").value.trim();
    const displayNameValue = document.getElementById("clubDisplayName").value.trim();
    localClubData.displayName = nameValue === displayNameValue ? null : displayNameValue;
    localClubData.tags = localClubData.tags || [];

    localClubData.type_of_club = document.getElementById("typeOfClubSelect").value;
    localClubData.entry_price = parseFloat(document.getElementById("entryPrice").value || "0");
    localClubData.primary_color = document.getElementById("primaryColor").value;
    localClubData.secondary_color = document.getElementById("secondaryColor").value;
    localClubData.font = document.getElementById("font").value;
    localClubData.description = document.getElementById("clubDescription").value;

    const entrance = document.getElementById("entrance")?.value.trim();
    if (entrance) {
        const [latStr, lonStr] = entrance.split(",").map(s => s.trim());
        const lat = parseFloat(latStr);
        const lon = parseFloat(lonStr);

        if (!isNaN(lat) && !isNaN(lon)) {
            localClubData.lat = lat;
            localClubData.lon = lon;
        } else {
            localClubData.lat = null;
            localClubData.lon = null;
        }
    }

    localClubData.corners = [];
    let i = 1;
    while (true) {
        const input = document.getElementById(`corner${i}`);
        if (!input) break;
        const value = input.value.trim();
        if (value) {
            const [latStr, lonStr] = value.split(",").map(s => s.trim());
            const lat = parseFloat(latStr);
            const lon = parseFloat(lonStr);
            if (!isNaN(lat) && !isNaN(lon)) {
                localClubData.corners.push(new GeoPoint(lat, lon));
            }
        }
        i++;
    }

    const dayData = localClubData.opening_hours[today];
    const hoursValue = dayData && dayData.open && dayData.close
        ? `${dayData.open} - ${dayData.close}`
        : document.getElementById(`${today}-hours`).value || "Closed";

    const ageValue = document.getElementById(`${today}-age`).value.replace("+", "");
    const ageRestriction = ageValue ? parseInt(ageValue) : localClubData.age_restriction;
    const displayNameToUse = localClubData.displayName || toTitleCase(localClubData.name);

    updateIPhoneDisplay({
        displayName: displayNameToUse,
        logo: localClubData.logoPreviewUrl || localClubData.logo,
        type: localClubData.type_of_club,
        ageRestriction: ageRestriction >= 16 ? ageRestriction : localClubData.age_restriction,
        entryPrice: localClubData.entry_price,
        primaryColor: localClubData.primary_color,
        secondaryColor: localClubData.secondary_color,
        font: localClubData.font,
        openingHours: hoursValue,
        lat: localClubData.lat,
        lon: localClubData.lon
    });
}

function setupLivePreviewBindings() {
    const today = getTodayKey();
    const inputs = {
        displayName: document.getElementById("clubDisplayName"),
        logo: document.getElementById("clubLogoImg"),
        type: document.getElementById("typeOfClubSelect"),
        maxVisitors: document.getElementById("maxVisitors"),
        entryPrice: document.getElementById("entryPrice"),
        primaryColor: document.getElementById("primaryColor"),
        secondaryColor: document.getElementById("secondaryColor"),
        font: document.getElementById("font"),
        entrance: document.getElementById("entrance"),
        description: document.getElementById("clubDescription")
    };

    Object.values(inputs).forEach((input) => {
        if (input) {
            const eventType = input.tagName === "SELECT" ? "change" : "input";
            input.addEventListener(eventType, syncAndUpdatePreview);
        }
    });

    const hoursElem = document.getElementById(`${today}-hours`);
    if (hoursElem) {
        hoursElem.addEventListener("input", syncAndUpdatePreview);
    }
    const ageElem = document.getElementById(`${today}-age`);
    if (ageElem) {
        ageElem.addEventListener("input", syncAndUpdatePreview);
    }

    days.forEach((day) => {
        const hoursElement = document.getElementById(`${day}-hours`);
        const hoursContainer = hoursElement?.parentElement;
        if (hoursContainer) {
            hoursContainer.addEventListener("click", () => {
                showTimePicker(day, hoursElement, (day, newHours) => {
                    hoursElement.value = newHours;
                    if (day === today) {
                        hoursElement.dispatchEvent(new Event("input"));
                    }
                });
            });
        }

        const ageElement = document.getElementById(`${day}-age`);
        const ageContainer = ageElement?.parentElement;
        if (ageContainer) {
            ageContainer.setAttribute("tabindex", "0");
            const openAgePicker = () => {
                showAgePicker(day, ageElement, (day, newAge) => {
                    const displayAge = newAge < 18 ? "Not set" : `${newAge}+`;
                    ageElement.value = displayAge;
                    if (day === today) {
                        ageElement.dispatchEvent(new Event("input"));
                    }
                });
            };
            ageContainer.addEventListener("click", openAgePicker);
            ageContainer.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openAgePicker();
                }
            });
        }
    });

    syncAndUpdatePreview();
}

function bindLeftInputs() {
    const nameInput = document.getElementById("clubNameInput");
    if (nameInput) {
        nameInput.addEventListener("input", () => {
            document.querySelector(".header-title").textContent = nameInput.value;
            syncAndUpdatePreview();
        });
    }

    const typeSelect = document.getElementById("typeOfClubSelect");
    if (typeSelect) {
        typeSelect.addEventListener("change", () => {
            const img = document.getElementById("clubTypeImg");
            if (img) {
                img.src = typeSelect.value
                    ? `/images/clubtype/${typeSelect.value}_icon.png`
                    : "/images/default_type.png";
            }
            syncAndUpdatePreview();
        });
    }

    const primaryColor = document.getElementById("primaryColor");
    if (primaryColor) {
        primaryColor.addEventListener("click", () => {
            showColorPicker(primaryColor, (color) => {
                primaryColor.value = color;
                syncAndUpdatePreview();
            });
        });
    }

    const secondaryColor = document.getElementById("secondaryColor");
    if (secondaryColor) {
        secondaryColor.addEventListener("click", () => {
            showColorPicker(secondaryColor, (color) => {
                secondaryColor.value = color;
                syncAndUpdatePreview();
            });
        });
    }
}

function showColorPicker(inputElement, onColorSelect) {
    const existingPopup = document.querySelector(".color-picker-popup");
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement("div");
    popup.className = "color-picker-popup";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = inputElement.value || "#000000";
    popup.appendChild(colorInput);

    const rect = inputElement.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(popup);

    requestAnimationFrame(() => colorInput.click());

    colorInput.addEventListener("input", () => {
        inputElement.value = colorInput.value;
        onColorSelect(colorInput.value);
    });

    const closePopup = (e) => {
        if (!popup.contains(e.target) && e.target !== inputElement) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

function showTimePicker(day, hoursElement, onTimeSelect) {
    const existingPopup = document.querySelector(".time-picker-popup");
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement("div");
    popup.className = "time-picker-popup";
    popup.setAttribute("tabindex", "0");

    const header = document.createElement("h3");
    header.className = "popup-header";
    header.textContent = `Opening Hours ${day.charAt(0).toUpperCase() + day.slice(1)}`;
    popup.appendChild(header);

    const openLabel = document.createElement("label");
    openLabel.textContent = "Open Time:";
    const openInput = document.createElement("input");
    openInput.type = "time";
    openInput.value = hoursElement.value.split(" - ")[0] || "";
    popup.appendChild(openLabel);
    popup.appendChild(openInput);

    const closeLabel = document.createElement("label");
    closeLabel.textContent = "Close Time:";
    const closeInput = document.createElement("input");
    closeInput.type = "time";
    closeInput.value = hoursElement.value.split(" - ")[1] || "";
    popup.appendChild(closeLabel);
    popup.appendChild(closeInput);

    const setupAutoColon = (input) => {
        input.addEventListener("input", () => {
            if (/^\d{2}$/.test(input.value)) {
                input.value = `${input.value}:00`;
                input.setSelectionRange(3, 3);
            }
        });
    };
    setupAutoColon(openInput);
    setupAutoColon(closeInput);

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => {
        const openTime = openInput.value;
        const closeTime = closeInput.value;
        const newHours = openTime && closeTime ? `${openTime} - ${closeTime}` : "Closed";
        hoursElement.value = newHours;

        if (newHours === "Closed") {
            localClubData.opening_hours[day] = null;
        } else {
            if (!localClubData.opening_hours[day]) {
                localClubData.opening_hours[day] = {};
            }
            localClubData.opening_hours[day].open = openTime;
            localClubData.opening_hours[day].close = closeTime;
        }

        onTimeSelect(day, newHours);
        popup.remove();

        if (day === getTodayKey()) {
            syncAndUpdatePreview();
        }
    });
    popup.appendChild(saveButton);

    popup.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveButton.click();
        }
    });

    const rect = hoursElement.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(popup);
    requestAnimationFrame(() => {
        openInput.focus();
    });

    const closePopup = (e) => {
        if (!popup.contains(e.target) && e.target !== hoursElement) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

function showAgePicker(day, ageElement, onAgeSelect) {
    const existingPopup = document.querySelector(".age-picker-popup");
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement("div");
    popup.className = "age-picker-popup";
    popup.setAttribute("tabindex", "0");

    const header = document.createElement("h3");
    header.className = "popup-header";
    header.textContent = `Age Restriction ${day.charAt(0).toUpperCase() + day.slice(1)}`;
    popup.appendChild(header);

    const ageLabel = document.createElement("label");
    ageLabel.textContent = "Age Limit:";
    const ageInput = document.createElement("input");
    ageInput.type = "number";
    ageInput.min = 16;
    ageInput.max = 35;
    const currentAge = parseInt(ageElement.value.replace("+", ""));
    ageInput.value = ageElement.value === "Not set" || isNaN(currentAge) ? "" : currentAge;
    popup.appendChild(ageLabel);
    popup.appendChild(ageInput);

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => {
        let newAge = parseInt(ageInput.value);
        if (isNaN(newAge) || newAge < 16 || newAge > 35) {
            showAlert({
                title: 'Invalid Age',
                text: 'Please enter an age between 16 and 35.',
                icon: swalTypes.warning
            });
            return;
        }
        onAgeSelect(day, newAge);
        popup.remove();
    });
    popup.appendChild(saveButton);

    popup.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveButton.click();
        }
    });

    const rect = ageElement.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(popup);
    requestAnimationFrame(() => {
        ageInput.focus();
    });

    const closePopup = (e) => {
        if (!popup.contains(e.target) && e.target !== ageElement) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

function showOfferPopup(day, clubId, offerButton) {
    getOfferImageUrl(clubId, day).then(url =>
        showImagePopup(clubId, day, url || "/images/default_offer.png", offerButton)
    );
}

async function handleOfferAction(day, clubId, offerButton) {
    const hasSpecificOffer = !!localClubData?.opening_hours?.[day]?.daily_offer;
    const hasMainOffer = !!mainOfferImgUrl;
    if (hasSpecificOffer || hasMainOffer) {
        showOfferPopup(day, clubId, offerButton);
    } else {
        uploadSpecificOffer(day, clubId, offerButton, null);
    }
}

function uploadSpecificOffer(day, clubId, offerButton, popup) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        const blob = await convertToWebP(file);
        const previewUrl = URL.createObjectURL(blob);

        offerButton.textContent = "Processing...";
        offerButton.disabled = true;

        try {
            localOfferImages[day] = {blob, previewUrl};

            if (!localClubData.opening_hours[day]) {
                localClubData.opening_hours[day] = {};
            }
            localClubData.opening_hours[day].daily_offer = `${day}_offer.webp`;

            syncClubDataCache(clubId);
            offerButton.textContent = "Specific Offer";
            offerButton.classList.add("has-offer");
            updateImagesSection(clubId);
            if (popup) popup.remove();
            if (day === getTodayKey()) syncAndUpdatePreview();
        } catch (error) {
            console.error(`Error processing specific offer for ${day}:`, error);
            showAlert({
                title: 'Offer Upload Failed',
                text: `Failed to process specific offer for ${day}.`,
                icon: swalTypes.error
            });
        } finally {
            offerButton.disabled = false;
        }
    };
}

export async function getOfferImageUrl(clubId, day) {
    const clubData = getAllVisibleLocations().find(club => club.id === clubId) || localClubData;
    const dayData = clubData?.opening_hours?.[day];
    const offerFileName = dayData?.daily_offer ?? null;

    if (offerFileName) {
        if (localOfferImages[day]?.previewUrl) {
            return localOfferImages[day].previewUrl;
        }
        const storagePath = `${databaseStorage.clubImages}/${clubId}/${databaseStorage.clubOffers}/${offerFileName}`;
        try {
            return await getDownloadURL(ref(storage, storagePath));
        } catch (error) {
            const storagePathUpperCase = `${databaseStorage.clubImages}/${clubId.charAt(0).toUpperCase() + clubId.slice(1).toLowerCase()}/${databaseStorage.clubOffers}/${offerFileName}`;
            return await getDownloadURL(ref(storage, storagePathUpperCase));
            console.warn(`No offer image found for ${day}:`, error);
            return null;
        }
    }
    return null;
}

function syncClubDataCache(clubId) {
    const clubs = getAllVisibleLocations();
    const index = clubs.findIndex(club => club.id === clubId);
    if (index !== -1) {
        console.log("Local club data is in sync with DOM changes.");
    }
}

function arraysEqual(arr1, arr2) {
    if (!arr1 || !arr2) return arr1 === arr2;
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i].latitude !== arr2[i].latitude || arr1[i].longitude !== arr2[i].longitude) {
            return false;
        }
    }
    return true;
}

function getChanges() {
    const changes = [];

    if (localClubData.name !== originalDbData.name) {
        changes.push({ field: "Name", oldValue: originalDbData.name, newValue: localClubData.name });
    }
    if (localClubData.displayName !== originalDbData.displayName) {
        changes.push({ field: "Display Name", oldValue: originalDbData.displayName, newValue: localClubData.displayName });
    }
    if (localClubData.type_of_club !== originalDbData.type_of_club) {
        changes.push({ field: "Type of Club", oldValue: originalDbData.type_of_club, newValue: localClubData.type_of_club });
    }
    if (localClubData.lat !== originalDbData.lat) {
        changes.push({ field: "Latitude", oldValue: originalDbData.lat, newValue: localClubData.lat });
    }
    if (localClubData.lon !== originalDbData.lon) {
        changes.push({ field: "Longitude", oldValue: originalDbData.lon, newValue: localClubData.lon });
    }
    if (!arraysEqual(localClubData.corners, originalDbData.corners)) {
        changes.push({ field: "Corners", change: "Updated" });
    }
    if (localClubData.total_possible_amount_of_visitors !== originalDbData.total_possible_amount_of_visitors) {
        changes.push({ field: "Max Visitors", oldValue: originalDbData.total_possible_amount_of_visitors, newValue: localClubData.total_possible_amount_of_visitors });
    }
    if (localClubData.entry_price !== originalDbData.entry_price) {
        changes.push({ field: "Entry Price", oldValue: originalDbData.entry_price, newValue: localClubData.entry_price });
    }
    if (localClubData.primary_color !== originalDbData.primary_color) {
        changes.push({ field: "Primary Color", oldValue: originalDbData.primary_color, newValue: localClubData.primary_color });
    }
    if (localClubData.secondary_color !== originalDbData.secondary_color) {
        changes.push({ field: "Secondary Color", oldValue: originalDbData.secondary_color, newValue: localClubData.secondary_color });
    }
    if (localClubData.font !== originalDbData.font) {
        changes.push({ field: "Font", oldValue: originalDbData.font, newValue: localClubData.font });
    }
    if (localClubData.description !== originalDbData.description) {
        changes.push({ field: "Description", oldValue: originalDbData.description, newValue: localClubData.description });
    }

    const originalTags = (originalDbData.tags || []).slice().sort();
    const currentTags = (localClubData.tags || []).slice().sort();
    if (!arraysEqualPrimitive(originalTags, currentTags)) {
        changes.push({
            field: "Tags",
            oldValue: originalTags.join(", "),
            newValue: currentTags.join(", ")
        });
    }

    if (localClubData.logo !== originalLogoUrl) {
        changes.push({ field: "Logo", change: "Updated" });
    }

    // Banner Image
    if (localClubData.banner_image) {
        if (localClubData.banner_image.file || !originalDbData.banner_image) {
            changes.push({ field: "Banner Image", change: "Added/Updated" });
        }
    } else if (originalDbData.banner_image) {
        changes.push({ field: "Banner Image", change: "Removed" });
    }

    // Location Images
    const originalLocImages = originalDbData.location_images || [];
    const localLocImages = localClubData.location_images || [];
    if (originalLocImages.length !== localLocImages.length || localLocImages.some(img => img.file)) {
        changes.push({ field: "Location Images", change: "Updated" });
    }

    // Barcard
    if ((localClubData.barcard && localClubData.barcard.previewUrl && localClubData.barcard.previewUrl.startsWith("blob:")) ||
        (localClubData.barcard && !originalDbData.barcard) ||
        (!localClubData.barcard && originalDbData.barcard)) {
        changes.push({ field: "Barcard", change: "Added/Updated/Removed" });
    }

    days.forEach(day => {
        const originalDay = originalDbData.opening_hours?.[day] || {};
        const localDay = localClubData.opening_hours?.[day] || {};

        if (localDay.open !== originalDay.open || localDay.close !== originalDay.close) {
            const oldHours = originalDay.open && originalDay.close ? `${originalDay.open} - ${originalDay.close}` : "Closed";
            const newHours = localDay.open && localDay.close ? `${localDay.open} - ${localDay.close}` : "Closed";
            changes.push({ field: `${day.charAt(0).toUpperCase() + day.slice(1)} Hours`, oldValue: oldHours, newValue: newHours });
        }

        if (localDay.ageRestriction !== originalDay.ageRestriction) {
            const oldAge = originalDay.ageRestriction ? `${originalDay.ageRestriction}+` : "Not set";
            const newAge = localDay.ageRestriction ? `${localDay.ageRestriction}+` : "Not set";
            changes.push({ field: `${day.charAt(0).toUpperCase() + day.slice(1)} Age Restriction`, oldValue: oldAge, newValue: newAge });
        }

        const originalOffer = originalDay.daily_offer;
        const localOffer = localDay.daily_offer;
        if (originalOffer && !localOffer) {
            changes.push({ field: `${day.charAt(0).toUpperCase() + day.slice(1)} Offer`, change: "Deleted" });
        } else if (!originalOffer && localOffer) {
            changes.push({ field: `${day.charAt(0).toUpperCase() + day.slice(1)} Offer`, change: "Added" });
        } else if (originalOffer && localOffer && originalOffer !== localOffer) {
            changes.push({ field: `${day.charAt(0).toUpperCase() + day.slice(1)} Offer`, change: "Updated" });
        }
    });

    return changes;
}

function showChangesPopup() {
    const errors = validateClubData();
    if (errors.length > 0) {
        console.log("Validation failed:", errors);
        showAlert({
            title: '⚠️ Please Review the Form',
            html: `<ul style="text-align: left;">${errors.map(e => `<li>${e}</li>`).join('')}</ul>`,
            icon: swalTypes.warning
        });
        return;
    }

    console.log("Saving changes...", localClubData);
    const selectedClubId = getClubSession();
    if (!selectedClubId) {
        console.log("No club selected");
        showAlert({
            title: 'No Club Selected',
            text: 'Please select a club before saving.',
            icon: swalTypes.warning
        });
        return;
    }

    if (getClubSession() === "add-new") {
        // Save club
    }

    const changes = getChanges();
    // if (changes.length === 0) {
    //     showAlert({
    //         title: 'No Changes',
    //         text: 'There are no changes to save.',
    //         icon: swalTypes.info
    //     });
    //     return;
    // }

    const popup = document.createElement("div");
    popup.className = "offer-popup";

    const header = document.createElement("h3");
    header.className = "popup-header";
    header.textContent = "Confirm Changes";
    popup.appendChild(header);

    const content = document.createElement("div");
    content.className = "popup-content";

    const list = document.createElement("ul");
    list.style.paddingLeft = "20px";
    changes.forEach(change => {
        const li = document.createElement("li");
        li.textContent = change.change
            ? `${change.field}: ${change.change}`
            : `${change.field}: ${change.oldValue} → ${change.newValue}`;
        list.appendChild(li);
    });
    content.appendChild(list);
    popup.appendChild(content);

    const footer = document.createElement("div");
    footer.className = "popup-footer";

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => popup.remove());
    footer.appendChild(cancelButton);

    const confirmButton = document.createElement("button");
    confirmButton.textContent = "Yes, Save Changes";
    confirmButton.style.backgroundColor = "var(--night-view-green)";
    confirmButton.addEventListener("click", () => {
        saveChanges();
        popup.remove();
    });
    footer.appendChild(confirmButton);

    popup.appendChild(footer);

    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.color = "#000";
    popup.style.backgroundColor = "white";
    popup.style.padding = "20px";
    popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    popup.style.zIndex = "1000";

    document.body.appendChild(popup);

    const closePopup = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

async function saveChanges() {
    const selectedClubId = getClubSession();

    showLoading();

    console.log("Fetching logo name...");
    localClubData.logo = await getAvailableLogoName(localClubData.name);
    console.log("Logo name assigned:", localClubData.logo);

    console.log("Collecting days data...");
    collectAllDaysData();
    console.log("Calculating entry price and age...");
    calculateEntryPriceAndAgeAndResetDaily();
    console.log("Getting changes...");
    const changes = getChanges();
    console.log("Changes detected:", changes);

    console.log("Processing opening hours...");
    Object.keys(localClubData.opening_hours).forEach((day) => {
        const hoursField = document.getElementById(`${day}-hours`);
        const isClosed = hoursField?.value?.trim().toLowerCase() === "closed";
        if (isClosed) {
            localClubData.opening_hours[day] = null;
        }
    });

    try {
        console.log("Preparing club ID...");
        let clubIdForUpload = await getAvailableId(localClubData.name);
        console.log("Club ID for upload:", clubIdForUpload);

        localClubData = prepareDataForUpload(localClubData);
        console.log("Data prepared for upload:", JSON.stringify(localClubData, null, 2));

        if (selectedClubId === "add-new") {
            console.log("Saving new club...");
            let customDocRef = doc(db, databaseCollections.newClubs, clubIdForUpload);
            if (getSession().role === 'admin') {
                customDocRef = doc(db, databaseCollections.clubData, clubIdForUpload);
            }
            localClubData.created_by = getSession().uid;
            localClubData.created_at = serverTimestamp();
            localClubData.processed = false;

            await setDoc(customDocRef, localClubData);
            updateNewLocations();
            console.log("New club saved with ID:", clubIdForUpload);
        } else {
            console.log("Updating existing club...");

            const existingClubDocRef = doc(db, databaseCollections.clubData, selectedClubId);

            try {
                const existingSnap = await getDoc(existingClubDocRef);

                if (existingSnap.exists()) {
                    const existingData = existingSnap.data();

                    try {
                        const backupRef = doc(db, databaseCollections.clubDataBackups, selectedClubId);
                        await setDoc(backupRef, {
                            ...existingData,
                            backup_created_at: serverTimestamp(),
                            backup_created_by: getSession().uid,
                        }, {merge: true});
                        console.log("Backup updated for club:", selectedClubId);
                    } catch (err) {
                        console.error("Failed to create backup. Update aborted:", err);
                        return;
                    }

                    await setDoc(
                        existingClubDocRef,
                        {
                            ...localClubData,
                            updated_at: serverTimestamp(),
                            updated_by: getSession().uid,
                        },
                        {merge: true}
                    );

                    console.log("Existing club updated with ID:", selectedClubId);
                    loadData(selectedClubId, true);
                } else {
                    console.warn(`Club with ID ${selectedClubId} does not exist.`);
                }
            } catch (error) {
                console.error("Error during club update:", error);
            }
        }

        if (pendingLogoBlob && pendingLogoFilename) {
            console.log("Uploading logo...");
            pendingLogoFilename = localClubData.logo;
            const path = `${databaseStorage.clubLogos}/${pendingLogoFilename}`;
            await uploadImageToFirestore(pendingLogoBlob, path);
            console.log("Logo uploaded successfully");
            pendingLogoBlob = null;
            pendingLogoFilename = null;
        }

        if (localClubData.banner_image?.file) {
            const bannerPath = `${databaseStorage.clubImages}/${clubIdForUpload}/cover_image.webp`;
            await uploadImageToFirestore(localClubData.banner_image.file, bannerPath);
            localClubData.banner_image = "cover_image.webp";
        }

        if (localClubData.location_images?.length) {
            localClubData.location_images = await Promise.all(
                localClubData.location_images.map(async (imgData, i) => {
                    const imgName = `stock_mood_image_${i + 1}.webp`;
                    if (imgData.file) {
                        const imgPath = `${databaseStorage.clubImages}/${clubIdForUpload}/mood_images_stock/${imgName}`;
                        await uploadImageToFirestore(imgData.file, imgPath);
                    }
                    return imgName;
                })
            );
        }

        if (localClubData.barcard && localClubData.barcard.previewUrl && localClubData.barcard.previewUrl.startsWith("blob:")) {
            const barcardPath = `${databaseStorage.clubImages}/${clubIdForUpload}/barcard.pdf`;
            const response = await fetch(localClubData.barcard.previewUrl);
            const blob = await response.blob();
            await uploadBytes(ref(storage, barcardPath), blob);
            localClubData.barcard = "barcard.pdf";
        }

        console.log("Starting daily offer uploads...");
        for (const day of Object.keys(localClubData.opening_hours)) {
            const dayData = localClubData.opening_hours[day];
            const offerName = dayData?.daily_offer;
            let offerImageData = localOfferImages[day];

            if ((!offerImageData || !offerImageData.blob) && offerName) {
                console.log(`Fetching blob for ${day} offer...`);
                try {
                    const imgEl = document.querySelector(`#${day}-offer-image`);
                    if (imgEl?.src) {
                        const blob = await fetch(imgEl.src).then(res => res.blob());
                        offerImageData = {blob};
                        localOfferImages[day] = offerImageData;
                    } else {
                        console.warn(`No image element for ${day}, skipping.`);
                    }
                } catch (error) {
                    console.error(`Error fetching blob for ${day}:`, error);
                }
            }

            if (offerName && offerImageData?.blob instanceof Blob) {
                const path = `${databaseStorage.clubImages}/${clubIdForUpload}/${databaseStorage.clubOffers}/${offerName}`;
                console.log(`Uploading offer for ${day}: ${offerName}`);
                await uploadImageToFirestore(offerImageData.blob, path);
                console.log(`Offer for ${day} uploaded`);
            } else {
                console.log(`Skipping ${day}: No valid offer image`);
            }
        }

        if (window.menuImages?.length) {
            console.log("Uploading menu images...");
            for (const img of window.menuImages) {
                const path = `${databaseStorage.clubImages}/${clubIdForUpload}/${img.name}`;
                await uploadImageToFirestore(img.file, path);
                console.log(`Menu image uploaded: ${img.name}`);
            }
        }
        hideLoading();
        console.log("Save completed, showing success alert...");
        if (getClubSession() === 'add-new') {
            showAlert({
                title: 'Location Submitted!',
                text: 'New club submitted for approval!',
                icon: swalTypes.success
            });
        } else {
            const clubName = nameFormatter(getClubSession());
            showAlert({
                title: 'Location successfully changed!',
                text: `${clubName} has successfully been changed!`,
                icon: swalTypes.success
            });
        }
    } catch (error) {
        hideLoading();
        console.error("Error during save:", error);
        showAlert({
            title: 'Save Failed',
            text: 'Failed to save changes. Please try again.',
            icon: swalTypes.error
        });
    }
    if (selectedClubId === ('add-new')) {
        prepareNewClubForm();
    } else {
        resetData(selectedClubId);
    }
}

function collectAllDaysData() {
    days.forEach(day => {
        const hoursValue = document.getElementById(`${day}-hours`).value;
        let dayData = localClubData.opening_hours[day] || {};

        if (hoursValue === "Closed") {
            localClubData.opening_hours[day] = null;
        } else {
            const [open, close] = hoursValue.split(" - ");
            dayData = {...dayData, open, close};
        }

        const ageValue = document.getElementById(`${day}-age`).value.replace("+", "");
        const ageRestriction = ageValue === "Not set" ? null : parseInt(ageValue);
        dayData.ageRestriction = ageRestriction >= 16 ? ageRestriction : null;
        localClubData.opening_hours[day] = dayData;
    });
}

function prepareNewClubForm() {
    showLoading();
    openLocationSection();
    console.log("Preparing new club form...");

    originalDbData = createEmptyClubData();
    localClubData = createEmptyClubData();

    mainOfferImgUrl = null;
    localOfferImages = {};

    document.querySelector(".header-title").textContent = "";
    document.getElementById("clubNameInput").value = "";
    document.getElementById("clubDisplayName").value = "";

    const typeOfClubSelect = document.getElementById("typeOfClubSelect");
    if (typeOfClubSelect) {
        typeOfClubSelect.innerHTML = "";
        Object.entries(CLUB_TYPES_ENGLISH).forEach(([dbValue, displayLabel]) => {
            const option = document.createElement("option");
            option.value = dbValue;
            option.textContent = displayLabel;
            typeOfClubSelect.appendChild(option);
        });
        typeOfClubSelect.value = "";
    }

    document.getElementById("entrance").value = "";

    const container = document.getElementById("corners-container");
    container.querySelectorAll(".field-item").forEach(el => el.remove());

    for (let i = 1; i <= 4; i++) {
        const fieldDiv = document.createElement("div");
        fieldDiv.className = "field-item";

        const label = document.createElement("label");
        label.setAttribute("for", `corner${i}`);
        label.textContent = `Corner ${i} (lat, lon)`;

        const input = document.createElement("input");
        input.type = "text";
        input.id = `corner${i}`;
        input.placeholder = "e.g., 45.1, 58.1";
        input.pattern = "^-?\\d+(\\.\\d+)?\\s*,\\s*-?\\d+(\\.\\d+)?$";

        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);
        container.insertBefore(fieldDiv, document.getElementById("addCornerBtn"));
    }
    cornerCount = localClubData.corners.length || 4;

    document.getElementById("maxVisitors").value = "";
    document.getElementById("entryPrice").value = "0";
    document.getElementById("primaryColor").value = "NightView Green";
    document.getElementById("secondaryColor").value = "NightView Black";

    const fontSelect = document.getElementById("font");
    if (fontSelect) {
        fontSelect.value = "NightView Font";
        new FontSelector("fontFieldItem", (selectedFont) => {
            localClubData.font = selectedFont;
            syncAndUpdatePreview();
        });
    }

    document.getElementById("clubDescription").value = "";

    const clubLogoImg = document.getElementById("clubLogoImg");
    if (clubLogoImg) {
        clubLogoImg.src = "";
        clubLogoImg.addEventListener("click", () => showLogoPopup("add-new", clubLogoImg));
    }

    const clubTypeImg = document.getElementById("clubTypeImg");
    if (clubTypeImg) {
        clubTypeImg.src = "/images/default_type.png";
    }

    days.forEach(day => {
        document.getElementById(`${day}-hours`).value = "Closed";
        document.getElementById(`${day}-age`).value = "Not set";
        const offerButton = document.getElementById(`${day}-offer`);
        if (offerButton) {
            offerButton.textContent = "Add Offer";
            offerButton.classList.remove("has-offer");
            offerButton.removeEventListener("click", offerButton._clickHandler);
            offerButton._clickHandler = () => handleOfferAction(day, "add-new", offerButton);
            offerButton.addEventListener("click", offerButton._clickHandler);
        } else {
            console.warn(`No offer button found for ${day}`);
        }
    });

    updateImagesSection("add-new");
    setupLivePreviewBindings();
    bindLeftInputs();
    setupTagSelection();
    syncAndUpdatePreview();
    hideLoading();
}

function openLocationSection() {
    const locationDetails = document.querySelector('details summary');
    if (!locationDetails) return;

    const summaries = Array.from(document.querySelectorAll('details > summary'));
    const locationSummary = summaries.find(summary => summary.textContent.trim().toLowerCase() === 'location');
    if (locationSummary) {
        locationSummary.parentElement.open = true;
        locationSummary.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
}

async function getAvailableLogoName(clubName) {
    const sanitizedClubName = clubName.trim().replace(/\s+/g, "_");
    let index = 0;
    let newFileName;

    const [dataSnap, newDataSnap] = await Promise.all([
        getDocs(collection(db, databaseCollections.clubData)),
        getDocs(collection(db, databaseCollections.newClubs))
    ]);
    const existingDocIds = [
        ...dataSnap.docs.map(doc => doc.id),
        ...newDataSnap.docs.map(doc => doc.id)
    ];

    do {
        newFileName = `${sanitizedClubName}_${index}_logo.webp`;
        index++;
    } while (existingDocIds.includes(newFileName.replace(".webp", "")));

    return newFileName;
}

async function getAvailableId(clubName) {
    const sanitizedClubName = clubName.trim().replace(/\s+/g, "_");
    let index = 0;
    let newId;

    const [dataSnap, newDataSnap] = await Promise.all([
        getDocs(collection(db, databaseCollections.clubData)),
        getDocs(collection(db, databaseCollections.newClubs))
    ]);

    const existingDocIds = [
        ...dataSnap.docs.map(doc => doc.id),
        ...newDataSnap.docs.map(doc => doc.id)
    ];

    do {
        newId = `${sanitizedClubName}_${index}`;
        index++;
    } while (existingDocIds.includes(newId));

    return newId.toLowerCase();
}

function calculateEntryPriceAndAgeAndResetDaily() {
    const ageCounts = {};

    days.forEach(day => {
        const dayData = localClubData.opening_hours?.[day];
        if (!dayData) return;

        if (dayData.ageRestriction != null) {
            ageCounts[dayData.ageRestriction] = (ageCounts[dayData.ageRestriction] || 0) + 1;
        }
    });

    const mostCommonAgeEntry = Object.entries(ageCounts).sort((a, b) => b[1] - a[1])[0];
    const mostCommonAge = mostCommonAgeEntry ? parseInt(mostCommonAgeEntry[0]) : 10;

    localClubData.age_restriction = mostCommonAge;

    days.forEach(day => {
        const dayData = localClubData.opening_hours?.[day];
        if (!dayData) return;

        if (dayData.ageRestriction === mostCommonAge) {
            dayData.ageRestriction = null;
        }
        dayData.entry_price = null;
    });
}

function createEmptyClubData() {
    return {
        name: "",
        displayName: null,
        type_of_club: "",
        lat: null,
        lon: null,
        corners: [],
        total_possible_amount_of_visitors: 0,
        entry_price: 0,
        primary_color: "NightView Green",
        secondary_color: "NightView Black",
        font: "NightView Font",
        age_restriction: null,
        opening_hours: {
            monday: null,
            tuesday: null,
            wednesday: null,
            thursday: null,
            friday: null,
            saturday: null,
            sunday: null
        },
        logo: "",
        tags: [],
        banner_image: null,
        location_images: [],
        barcard: null,
        description: ""
    };
}

function validateClubData() {
    const errors = [];

    if (!localClubData.name?.trim()) errors.push("Name is required.");
    if (!localClubData.type_of_club?.trim()) errors.push("Club type is required.");

    if (!(localClubData.total_possible_amount_of_visitors >= 0)) errors.push("Capacity must be a number greater than 0.");
    if (isNaN(localClubData.entry_price) || localClubData.entry_price < 0) errors.push("Entry price must be a non-negative number.");
    if (isNaN(localClubData.lat) || localClubData.lat < -90 || localClubData.lat > 90) errors.push("Latitude must be between -90 and 90.");
    if (isNaN(localClubData.lon) || localClubData.lon < -180 || localClubData.lon > 180) errors.push("Longitude must be between -180 and 180.");

    const entranceVal = document.getElementById("entrance")?.value.trim();
    if (!/^[-]?\d+(\.\d+)?\s*,\s*[-]?\d+(\.\d+)?$/.test(entranceVal)) {
        errors.push("Entrance must be in format: lat, lon (e.g., 55.1124214, 12.3232344)");
    }

    const geoPointPattern = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;

    let filledValidCorners = 0;
    let cornerIndex = 1;
    while (true) {
        const input = document.getElementById(`corner${cornerIndex}`);
        if (!input) break;

        const value = input.value.trim();
        if (value) {
            if (geoPointPattern.test(value)) {
                filledValidCorners++;
            } else {
                errors.push(`Corner ${cornerIndex} has an invalid format. Use: 'lat, lon'`);
            }
        }
        cornerIndex++;
    }

    if (filledValidCorners < 4) {
        errors.push("You must fill in at least 4 valid corners.");
    }

    const hasValidDay = days.some(day => {
        const hours = localClubData.opening_hours?.[day];
        return hours && hours.open && hours.close;
    });
    if (!hasValidDay) errors.push("At least one day must have valid opening hours.");

    return errors;
}

function updateImagesSection(clubId) {
    const imageManager = document.getElementById("imageManager");
    if (!imageManager) return;

    let wrapper = imageManager.querySelector(".image-button-wrapper");
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "image-button-wrapper";
        imageManager.appendChild(wrapper);
    }

    wrapper.querySelectorAll("button:not(#addImageBtn)").forEach(btn => btn.remove());

    let addImageBtn = wrapper.querySelector("#addImageBtn");
    if (!addImageBtn) {
        addImageBtn = document.createElement("button");
        addImageBtn.id = "addImageBtn";
        addImageBtn.className = "button button-add-image";
        addImageBtn.textContent = "➕ Add Image";
        wrapper.appendChild(addImageBtn);
    }

    const newAddImageBtn = addImageBtn.cloneNode(true);
    addImageBtn.replaceWith(newAddImageBtn);
    addImageBtn = newAddImageBtn;

    addImageBtn.addEventListener("click", () => {
        document.querySelector(".image-options-popup")?.remove();

        const popup = document.createElement("div");
        popup.className = "image-options-popup";

        const options = [
            { label: "Upload Location Images", accept: "image/*", multiple: true },
            { label: "Upload Banner Image", accept: "image/*" },
            { label: "Upload Barcard", accept: "application/pdf" }
        ];

        options.forEach(option => {
            const btn = document.createElement("button");
            btn.textContent = option.label;
            btn.addEventListener("click", () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = option.accept;
                input.click();

                input.onchange = async () => {
                    const file = input.files[0];
                    if (!file) return;

                    const tempUrl = URL.createObjectURL(file);
                    const imageData = {
                        file,
                        previewUrl: tempUrl
                    };

                    if (option.label === "Upload Barcard") {
                        localClubData.barcard = { name: "barcard.pdf", previewUrl: tempUrl };
                    } else if (option.label === "Upload Banner Image") {
                        imageData.name = "Banner";
                        localClubData.banner_image = imageData;
                    } else if (option.label === "Upload Location Images") {
                        localClubData.location_images = localClubData.location_images || [];
                        if (localClubData.location_images.length < 15) {
                            const index = localClubData.location_images.length + 1;
                            imageData.name = `Mood Image ${index}`;
                            localClubData.location_images.push(imageData);
                        } else {
                            showAlert({
                                title: 'Limit Reached',
                                text: 'You can only upload up to 15 Mood images.',
                                icon: 'warning'
                            });
                        }
                    }

                    updateImagesSection(clubId);
                    popup.remove();
                };
            });
            popup.appendChild(btn);
        });

        popup.style.position = "absolute";
        popup.style.top = `${addImageBtn.getBoundingClientRect().bottom + window.scrollY + 30}px`;
        popup.style.left = `${addImageBtn.getBoundingClientRect().left + window.scrollX + 30}px`;
        popup.style.background = "var(--color-black)";
        popup.style.border = "1px solid var(--night-view-purple)";
        popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
        popup.style.padding = "10px";
        popup.style.zIndex = "9999";
        document.body.appendChild(popup);

        setTimeout(() => {
            document.addEventListener("click", function closePopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener("click", closePopup);
                }
            });
        }, 0);
    });

    if (localClubData.logo) {
        const logoButton = document.createElement("button");
        logoButton.textContent = "Logo";
        logoButton.className = "button button-image";
        logoButton.addEventListener("click", () => showLogoPopup(clubId, document.getElementById("clubLogoImg")));
        wrapper.insertBefore(logoButton, addImageBtn);
    }

    if (localClubData.banner_image) {
        const bannerButton = document.createElement("button");
        bannerButton.textContent = "Banner";
        bannerButton.className = "button button-image";
        bannerButton.addEventListener("click", () => showImagePopup(clubId, "banner", localClubData.banner_image.previewUrl, bannerButton));
        wrapper.insertBefore(bannerButton, addImageBtn);
    }

    if (localClubData.location_images?.length) {
        localClubData.location_images.forEach((imgData, index) => {
            const locButton = document.createElement("button");
            locButton.className = "button button-image";
            locButton.textContent = imgData.name || `stock_mood_image_${index + 1}`;
            locButton.addEventListener("click", () => showImagePopup(clubId, `Mood Image ${index}`, imgData.previewUrl, locButton));
            wrapper.insertBefore(locButton, addImageBtn);
        });
    }

    if (localClubData.barcard) {
        const barcardButton = document.createElement("button");
        barcardButton.textContent = "Barcard";
        barcardButton.className = "button button-image";
        barcardButton.addEventListener("click", () => showBarcardPopup(clubId, localClubData.barcard.previewUrl, barcardButton));
        wrapper.insertBefore(barcardButton, addImageBtn);
    }

    days.forEach(day => {
        const hasSpecificOffer = !!localClubData?.opening_hours?.[day]?.daily_offer;
        if (hasSpecificOffer) {
            const offerButton = document.createElement("button");
            offerButton.textContent = `${toTitleCase(day)} Offer`;
            offerButton.className = "button button-image";
            offerButton.addEventListener("click", () => {
                getOfferImageUrl(clubId, day).then(url =>
                    showImagePopup(clubId, day, url || "/images/default_offer.png", offerButton)
                );
            });
            wrapper.insertBefore(offerButton, addImageBtn);
        }
    });

    if (window.menuImages?.length) {
        window.menuImages.forEach((imgData, index) => {
            const menuButton = document.createElement("button");
            menuButton.className = "button button-image";

            const img = document.createElement("img");
            img.src = imgData.previewUrl;
            img.alt = imgData.name;
            menuButton.appendChild(img);

            const label = document.createElement("span");
            label.textContent = imgData.name || `Menu Image ${index + 1}`;
            menuButton.appendChild(label);

            menuButton.addEventListener("click", () => showMenuImagePopup(imgData, index));
            wrapper.insertBefore(menuButton, addImageBtn);
        });
    }
}

function showMenuImagePopup(imgData, index) {
    const popup = document.createElement("div");
    popup.className = "offer-popup";

    const header = document.createElement("h3");
    header.textContent = imgData.name || `Menu Image ${index + 1}`;
    popup.appendChild(header);

    const img = document.createElement("img");
    img.src = imgData.previewUrl;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "80vh";
    popup.appendChild(img);

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete Image";
    deleteButton.addEventListener("click", () => {
        window.menuImages.splice(index, 1);
        updateImagesSection(getClubSession());
        popup.remove();
    });
    popup.appendChild(deleteButton);

    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.backgroundColor = "white";
    popup.style.padding = "20px";
    popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    popup.style.zIndex = "1000";

    document.body.appendChild(popup);

    const renameButton = document.createElement("button");
    renameButton.textContent = "Rename Image";
    renameButton.style.backgroundColor = "var(--night-view-green)";
    renameButton.addEventListener("click", () => {
        const newName = prompt("Enter new name:", imgData.name || `Menu Image ${index + 1}`);
        if (newName) {
            imgData.name = newName;
            updateImagesSection(getClubSession());
            popup.remove();
        }
    });
    popup.appendChild(renameButton);

    const closePopup = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

function showImagePopup(clubId, imageType, imageUrl, buttonElement) {
    const isLogo = imageType === "logo";
    const isBanner = imageType === "banner";
    const isLocation = imageType.startsWith("location_");
    const day = isLogo || isBanner || isLocation ? null : imageType;

    const popup = document.createElement("div");
    popup.className = "offer-popup";

    const header = document.createElement("h3");
    header.className = "popup-header";
    if (isLogo) {
        header.textContent = "Club Logo";
    } else if (isBanner) {
        header.textContent = "Banner";
    } else if (isLocation) {
        const index = imageType.split("_")[1];
        header.textContent = `Mood Image ${parseInt(index) + 1}`;
    } else {
        header.textContent = `Offer ${toTitleCase(day)}`;
    }
    popup.appendChild(header);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = header.textContent;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "80vh";
    popup.appendChild(img);

    const uploadButton = document.createElement("button");
    uploadButton.textContent = isLogo ? "Change Logo" : isBanner ? "Change Banner" : isLocation ? "Change Image" : "Change Offer";
    uploadButton.style.backgroundColor = "var(--night-view-green)";
    uploadButton.addEventListener("click", () => {
        if (isLogo) {
            uploadNewLogo(clubId, document.getElementById("clubLogoImg"), popup);
        } else if (isBanner) {
            uploadBannerImage(clubId, popup);
        } else if (isLocation) {
            const index = imageType.split("_")[1];
            uploadLocationImage(clubId, index, popup);
        } else {
            uploadSpecificOffer(day, clubId, document.getElementById(`${day}-offer`), popup);
        }
    });
    popup.appendChild(uploadButton);

    if (!isLogo && !isBanner && !isLocation && localClubData?.opening_hours?.[day]?.daily_offer) {
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete Offer";
        deleteButton.addEventListener("click", () => {
            if (confirm(`Are you sure you want to delete the offer for ${day}?`)) {
                delete localClubData.opening_hours[day].daily_offer;
                delete localOfferImages[day];
                syncClubDataCache(clubId);
                const offerButton = document.getElementById(`${day}-offer`);
                offerButton.textContent = mainOfferImgUrl ? "Main Offer" : "Add Offer";
                offerButton.classList.toggle("has-offer", !!mainOfferImgUrl);
                updateImagesSection(clubId);
                if (day === getTodayKey()) syncAndUpdatePreview();
                popup.remove();
            }
        });
        popup.appendChild(deleteButton);
    } else if (isLocation) {
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete Image";
        deleteButton.addEventListener("click", () => {
            if (confirm("Are you sure you want to delete this location image?")) {
                const index = imageType.split("_")[1];
                localClubData.location_images.splice(index, 1);
                updateImagesSection(clubId);
                popup.remove();
            }
        });
        popup.appendChild(deleteButton);
    }

    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.backgroundColor = "white";
    popup.style.padding = "20px";
    popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    popup.style.zIndex = "1000";
    document.body.appendChild(popup);

    const closePopup = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

function uploadBannerImage(clubId, popup) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        const blob = await convertToWebP(file);
        const previewUrl = URL.createObjectURL(blob);

        localClubData.banner_image = {
            file: blob,
            previewUrl: previewUrl,
            name: "cover_image"
        };

        updateImagesSection(clubId);
        if (popup) popup.remove();
    };
}

function uploadLocationImage(clubId, index, popup) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    input.onchange = async () => {
        const files = Array.from(input.files);
        for (const file of files) {
            const blob = await convertToWebP(file);
            const previewUrl = URL.createObjectURL(blob);
            const index = localClubData.location_images.length + 1;

            if (index <= 15) {
                localClubData.location_images.push({
                    file: blob,
                    previewUrl,
                    name: `stock_mood_image_${index}`
                });
            } else {
                showAlert({
                    title: 'Limit Reached',
                    text: 'You can only upload up to 15 location images.',
                    icon: 'warning'
                });
                break;
            }
        }
        updateImagesSection(clubId);
        if (popup) popup.remove();
    };
}

function showBarcardPopup(clubId, previewUrl, buttonElement) {
    const popup = document.createElement("div");
    popup.className = "offer-popup";

    const header = document.createElement("h3");
    header.textContent = "Barcard";
    popup.appendChild(header);

    const link = document.createElement("a");
    link.href = previewUrl;
    link.textContent = "View Barcard";
    link.target = "_blank";
    popup.appendChild(link);

    const uploadButton = document.createElement("button");
    uploadButton.textContent = "Change Barcard";
    uploadButton.style.backgroundColor = "var(--night-view-green)";
    uploadButton.addEventListener("click", () => {
        uploadBarcard(clubId, popup);
    });
    popup.appendChild(uploadButton);

    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.backgroundColor = "white";
    popup.style.padding = "20px";
    popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    popup.style.zIndex = "1000";
    document.body.appendChild(popup);

    const closePopup = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener("click", closePopup);
        }
    };
    setTimeout(() => document.addEventListener("click", closePopup), 0);
}

function prepareDataForUpload(data) {
    const defaultData = {
        name: data.name || "Unknown Club",
        logo: data.logo || "",
        type_of_club: data.type_of_club || "",
        type_of_club_img: data.type_of_club_img || "default_icon.png",
        age_restriction: data.age_restriction !== null && data.age_restriction !== undefined ? data.age_restriction : 18,
        total_possible_amount_of_visitors: data.total_possible_amount_of_visitors || 0,
        visitors: data.visitors || 0,
        rating: data.rating || 0,
        lat: data.lat || 0,
        lon: data.lon || 0,
        favorites: data.favorites || [],
        corners: data.corners || [],
        offer_type: data.offer_type || "none",
        tags: data.tags || [],
        main_offer_img: data.main_offer_img || null,
        opening_hours: data.opening_hours || {},
        display_name: data.display_name || null,
        entry_price: data.entry_price || 0,
        primary_color: data.primary_color || "NightView Green",
        secondary_color: data.secondary_color || "NightView Black",
        font: data.font || "NightView Font",
        created_by: data.created_by || null,
        created_at: data.created_at || null,
        processed: data.processed !== undefined ? data.processed : false,
        banner_image: data.banner_image || null,
        location_images: data.location_images || [],
        barcard: data.barcard || null,
        description: data.description || ""
    };

    return {...defaultData, ...data};
}

function arraysEqualPrimitive(a, b) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

function enforceDecimal(val) {
    return /^\-?\d+$/.test(val) ? `${val}.0` : val;
}

async function uploadBarcard(clubId, popup) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.click();
    input.onchange = async () => {
        const file = input.files[0];
        if (!file || file.type !== "application/pdf") {
            showAlert({ title: "Invalid File", text: "Please upload a PDF.", icon: "error" });
            return;
        }
        const tempUrl = URL.createObjectURL(file);
        localClubData.barcard = { name: "barcard.pdf", previewUrl: tempUrl };
        updateImagesSection(clubId);
        if (popup) popup.remove();
    };
}

document.getElementById("saveButton").addEventListener("click", showChangesPopup);

document.addEventListener("change", handleGenericInput);
document.addEventListener("input", handleGenericInput);

function handleGenericInput(e) {
    syncAndUpdatePreview();
}

window.addEventListener("clubChanged", () => {
    const selectedClubId = getClubSession();
    if (selectedClubId !== "add-new" && checkSession()) {
        loadData(selectedClubId);
    } else {
        prepareNewClubForm();
    }
});

document.getElementById("resetButton").addEventListener("click", () => {
    const clubId = getClubSession();
    if (clubId) {
        resetData(clubId);
    } else {
        showAlert({
            title: 'Reset Failed',
            text: 'Cannot reset — missing club info.',
            icon: swalTypes.error
        });
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const popups = document.querySelectorAll(
            ".color-picker-popup, .font-picker-popup, .time-picker-popup, .age-picker-popup, .offer-popup, .tag-popup"
        );
        popups.forEach(popup => popup.remove());
    }
});