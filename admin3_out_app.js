// --- នាំចូល Firebase SDKs ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, Timestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Enable Firestore debug logging
setLogLevel('debug');

// --- ការកំណត់រចនាសម្ព័ន្ធ Firebase ---
const firebaseConfig = { 
    apiKey: "AIzaSyDjr_Ha2RxOWEumjEeSdluIW3JmyM76mVk", 
    authDomain: "dipermisstion.firebaseapp.com", 
    projectId: "dipermisstion", 
    storageBucket: "dipermisstion.firebasestorage.app", 
    messagingSenderId: "512999406057", 
    appId: "1:512999406057:web:953a281ab9dde7a9a0f378", 
    measurementId: "G-KDPHXZ7H4B" 
};

// --- ផ្លូវ (Path) ទៅកាន់ Collection ---
let outRequestsCollectionPath;

// --- Global Variables ---
let db, auth;
let loadingIndicator;
let openFilterBtn, filterModal, filterMonth, filterYear, applyFilterBtn, cancelFilterBtn;

// (ថ្មី) References សម្រាប់ Tabs និង Sections
let tabOutNow, tabReturned;
let outNowSection, outNowList, outNowPlaceholder;
let returnedSection, returnedList, returnedPlaceholder;

let currentFilterMonth, currentFilterYear;
let requestsUnsubscribe = null; // Listener សម្រាប់ទិន្នន័យ
let currentView = 'out_now'; // ផ្ទាំងដែលកំពុង Active

// --- Date Helper Functions (ដូចដើម) ---
function formatFirestoreTimestamp(timestamp, format = 'HH:mm dd/MM/yyyy') {
    let date;
    if (!timestamp) return "";
    if (timestamp instanceof Date) date = timestamp;
    else if (timestamp.toDate) date = timestamp.toDate();
    else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
        if (isNaN(date.getTime())) return "";
    } else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else return "";

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (format === 'HH:mm' || format === 'time') return `${hours}:${minutes}`;
    if (format === 'dd/MM/yyyy' || format === 'date') return `${day}/${month}/${year}`;
    return `${hours}:${minutes} ${day}/${month}/${year}`;
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', async () => {

    // --- កំណត់ Element References ---
    loadingIndicator = document.getElementById('loading-indicator');
    openFilterBtn = document.getElementById('open-filter-btn');
    filterModal = document.getElementById('filter-modal');
    filterMonth = document.getElementById('filter-month');
    filterYear = document.getElementById('filter-year');
    applyFilterBtn = document.getElementById('apply-filter-btn');
    cancelFilterBtn = document.getElementById('cancel-filter-btn');

    // (ថ្មី) កំណត់ References សម្រាប់ Tabs និង Sections
    tabOutNow = document.getElementById('tab-out-now');
    tabReturned = document.getElementById('tab-returned');
    outNowSection = document.getElementById('out-now-section');
    outNowList = document.getElementById('out-now-list');
    outNowPlaceholder = document.getElementById('out-now-placeholder');
    returnedSection = document.getElementById('returned-section');
    returnedList = document.getElementById('returned-list');
    returnedPlaceholder = document.getElementById('returned-placeholder');

    // --- កំណត់ Filter ដំបូង (ដូចដើម) ---
    const now = new Date();
    currentFilterMonth = now.getMonth();
    currentFilterYear = now.getFullYear();
    filterMonth.value = currentFilterMonth;
    
    let yearExists = false;
    for (let i = 0; i < filterYear.options.length; i++) {
        if (filterYear.options[i].value == currentFilterYear) {
            yearExists = true;
            break;
        }
    }
    if (!yearExists) {
        const option = document.createElement('option');
        option.value = currentFilterYear;
        option.text = currentFilterYear;
        filterYear.add(option, filterYear.options[0]);
    }
    filterYear.value = currentFilterYear;

    // --- កំណត់ Event Listeners ---
    openFilterBtn.addEventListener('click', openFilterModal);
    cancelFilterBtn.addEventListener('click', closeFilterModal);
    applyFilterBtn.addEventListener('click', applyFilter);
    
    // (ថ្មី) Event Listeners សម្រាប់ Tabs
    tabOutNow.addEventListener('click', () => switchView('out_now'));
    tabReturned.addEventListener('click', () => switchView('returned'));

    // --- Firebase Initialization & Auth (ដូចដើម) ---
    try {
        if (!firebaseConfig.projectId) throw new Error("projectId not provided in firebase.initializeApp.");
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        outRequestsCollectionPath = `/artifacts/${canvasAppId}/public/data/out_requests`;
        
        console.log("Admin App (Out Only): Using Firestore Path:", outRequestsCollectionPath);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Admin App (Out Only): Firebase Auth state changed. User UID:", user.uid);
                fetchFilteredData();
            } else {
                console.log("Admin App (Out Only): No user signed in. Attempting anonymous sign-in...");
                signInAnonymously(auth).catch(anonError => {
                    console.error("Admin App (Out Only): Error during automatic anonymous sign-in:", anonError);
                });
            }
        });

        await signInAnonymously(auth);

    } catch (e) {
        console.error("Admin App (Out Only): Firebase Initialization/Auth Error:", e);
        if(loadingIndicator) loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: មិនអាចតភ្ជាប់ Firebase បានទេ។ ${e.message}</p>`;
    }
});

// --- (ថ្មី) មុខងារ​ប្តូរ Tab ---
function switchView(view) {
    currentView = view;
    if (view === 'out_now') {
        // បង្ហាញ Section កំពុងនៅក្រៅ
        outNowSection.classList.remove('hidden');
        returnedSection.classList.add('hidden');
        
        // កំណត់ Style ឲ្យ Tab
        tabOutNow.classList.add('active');
        tabReturned.classList.remove('active');
    } else {
        // បង្ហាញ Section បានចូលមកវិញ
        outNowSection.classList.add('hidden');
        returnedSection.classList.remove('hidden');
        
        // កំណត់ Style ឲ្យ Tab
        tabOutNow.classList.remove('active');
        tabReturned.classList.add('active');
    }
}

// --- មុខងារ​ទាញ​ទិន្នន័យ​តាម Filter ---
function fetchFilteredData() {
    console.log(`Fetching 'Out Requests' data for: ${currentFilterMonth + 1}/${currentFilterYear}`);
    
    // បង្ហាញ Loading
    loadingIndicator.classList.remove('hidden');
    outNowPlaceholder.classList.add('hidden');
    returnedPlaceholder.classList.add('hidden');
    outNowList.innerHTML = '';
    returnedList.innerHTML = '';

    // បញ្ឈប់ Listener ចាស់ (ប្រសិនបើមាន)
    if (requestsUnsubscribe) requestsUnsubscribe();

    try {
        const startDate = new Date(currentFilterYear, currentFilterMonth, 1);
        const endDate = new Date(currentFilterYear, currentFilterMonth + 1, 1);
        
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        // Query នេះគឺដូចដើម (ទាញយកទាំងអស់ដែល 'approved' ក្នុងខែនោះ)
        const outQuery = query(
            collection(db, outRequestsCollectionPath),
            where("status", "==", "approved"),
            where("requestedAt", ">=", startTimestamp),
            where("requestedAt", "<", endTimestamp)
        );

        requestsUnsubscribe = onSnapshot(outQuery, (snapshot) => {
            console.log(`Received snapshot. Size: ${snapshot.size}`);
            
            // (ថ្មី) ហៅ Function ថ្មី ដើម្បីបែងចែកទិន្នន័យ
            processAndRenderData(snapshot); 
            
            loadingIndicator.classList.add('hidden'); // លាក់ Loading
        }, (error) => {
            console.error("Error listening to history:", error);
            // បង្ហាញ Error ទាំងពីរ
            outNowPlaceholder.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
            outNowPlaceholder.classList.remove('hidden');
            returnedPlaceholder.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
            returnedPlaceholder.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        });

    } catch (e) {
        console.error("Error creating date query:", e);
        loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: ${e.message}</p>`;
    }
}

// --- (ថ្មី) មុខងារ​បែងចែកទិន្នន័យ និង​បង្ហាញ​ក្នុង List នីមួយៗ ---
function processAndRenderData(snapshot) {
    const allRequests = [];
    snapshot.forEach(doc => allRequests.push(doc.data()));

    // (ថ្មី) បែងចែកទិន្នន័យជា ២ ក្រុម
    const outNowRequests = allRequests.filter(r => r.returnStatus !== 'បានចូលមកវិញ');
    const returnedRequests = allRequests.filter(r => r.returnStatus === 'បានចូលមកវិញ');

    // (ថ្មី) បង្ហាញទិន្នន័យ ក្រុមទី១ (កំពុងនៅក្រៅ)
    renderHistoryList(outNowRequests, outNowList, outNowPlaceholder);
    
    // (ថ្មី) បង្ហាញទិន្នន័យ ក្រុមទី២ (បានចូលមកវិញ)
    renderHistoryList(returnedRequests, returnedList, returnedPlaceholder);
    
    // (ថ្មី) ធ្វើបច្ចុប្បន្នភាពចំនួន Count នៅលើ Tabs
    tabOutNow.innerHTML = `🚶 កំពុងនៅក្រៅ (${outNowRequests.length})`;
    tabReturned.innerHTML = `✔️ បានចូលមកវិញ (${returnedRequests.length})`;
}


// --- (កែសម្រួល) មុខងារ​បង្ហាញ Card ក្នុង​បញ្ជី ---
// Function នេះឥឡូវទទួលយក Array ជំនួសឲ្យ Snapshot
function renderHistoryList(requests, container, placeholder) {
    if (!container || !placeholder) return;
    
    if (requests.length === 0) {
        placeholder.classList.remove('hidden');
        container.innerHTML = '';
    } else {
        placeholder.classList.add('hidden');
        container.innerHTML = '';
        
        // រៀបចំតាមថ្ងៃស្នើសុំ (ថ្មីមុន)
        requests.sort((a, b) => {
            const timeA = a.requestedAt?.toMillis() ?? 0;
            const timeB = b.requestedAt?.toMillis() ?? 0;
            return timeB - timeA; 
        });

        requests.forEach(request => {
            container.innerHTML += renderAdminCard(request);
        });
    }
}

// --- មុខងារ​បង្កើត HTML សម្រាប់ Card នីមួយៗ (ដូចដើម) ---
function renderAdminCard(request) {
    if (!request || !request.requestId) return '';

    const dateString = request.startDate || 'N/A'; 
    
    const decisionTimeText = formatFirestoreTimestamp(request.decisionAt, 'HH:mm dd/MM/yyyy');

    // ពិនិត្យ​មើល​ការ "បញ្ជាក់​ចូល​មក​វិញ"
    let returnInfo = '';
    if (request.returnStatus === 'បានចូលមកវិញ') {
        returnInfo = `
            <div class="mt-3 pt-3 border-t border-dashed border-gray-200">
                <p class="text-sm font-semibold text-green-700">✔️ បានចូលមកវិញ</p>
                <p class="text-sm text-gray-600">នៅម៉ោង: ${request.returnedAt || 'N/A'}</p>
            </div>
        `;
    } else {
        // បើមិនទាន់ចូលមកវិញ
        returnInfo = `
             <div class="mt-3 pt-3 border-t border-dashed border-gray-200">
                 <p class="text-sm font-medium text-orange-600">🚶 កំពុងនៅក្រៅ</p>
             </div>
        `;
    }

    return `
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold text-gray-800">${request.name || 'N/A'} (${request.userId || 'N/A'})</p>
                    <p class="text-sm text-gray-500">${request.department || 'N/A'}</p>
                </div>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">បានយល់ព្រម</span>
            </div>
            
            <hr class="my-3 border-gray-100">
            
            <div class="space-y-1 text-sm">
                <p><b>រយៈពេល:</b> ${request.duration || 'N/A'}</p>
                <p><b>កាលបរិច្ឆេទ:</b> ${dateString}</p>
                <p><b>មូលហេតុ:</b> ${request.reason || 'មិនបានបញ្ជាក់'}</p>
            </div>

            <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                <p>អនុម័ត: ${decisionTimeText}</p>
                <p class="mt-1">ID: ${request.requestId}</p>
            </div>

            ${returnInfo} 
        </div>
    `;
}

// --- មុខងារ​សម្រាប់ Filter Modal (ដូចដើម) ---
function openFilterModal() {
    filterMonth.value = currentFilterMonth;
    filterYear.value = currentFilterYear;
    filterModal.classList.remove('hidden');
}

function closeFilterModal() {
    filterModal.classList.add('hidden');
}

function applyFilter() {
    currentFilterMonth = parseInt(filterMonth.value);
    currentFilterYear = parseInt(filterYear.value);
    
    closeFilterModal();
    
    // ហៅ​ទិន្នន័យ​ថ្មី (Function នេះនឹងបែងចែកទិន្នន័យទៅ Tab ទាំងពីរដោយស្វ័យប្រវត្តិ)
    fetchFilteredData();
}
