// --- នាំចូល Firebase SDKs ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, Timestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Enable Firestore debug logging
setLogLevel('debug');

// --- ការកំណត់រចនាសម្ព័ន្ធ Firebase (ដូចគ្នានឹងកម្មវិធី User) ---
// (សូម​ប្រាកដ​ថា​ព័ត៌មាន​នេះ​ត្រឹមត្រូវ)
const firebaseConfig = { 
    apiKey: "AIzaSyDjr_Ha2RxOWEumjEeSdluIW3JmyM76mVk", 
    authDomain: "dipermisstion.firebaseapp.com", 
    projectId: "dipermisstion", 
    storageBucket: "dipermisstion.firebasestorage.app", 
    messagingSenderId: "512999406057", 
    appId: "1:512999406057:web:953a281ab9dde7a9a0f378", 
    measurementId: "G-KDPHXZ7H4B" 
};

// --- ផ្លូវ (Path) ទៅកាន់ Collection "ច្បាប់ចេញក្រៅ" ---
let outRequestsCollectionPath;

// --- Global Variables ---
let db, auth;
let outListContainer, outPlaceholder, loadingIndicator;
let openFilterBtn, filterModal, filterMonth, filterYear, applyFilterBtn, cancelFilterBtn;

let currentFilterMonth, currentFilterYear;
let outUnsubscribe = null; // Listener សម្រាប់តែច្បាប់ចេញក្រៅ

// --- Date Helper Functions ---
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
    outListContainer = document.getElementById('out-list-container');
    outPlaceholder = document.getElementById('out-placeholder');
    loadingIndicator = document.getElementById('loading-indicator');
    openFilterBtn = document.getElementById('open-filter-btn');
    filterModal = document.getElementById('filter-modal');
    filterMonth = document.getElementById('filter-month');
    filterYear = document.getElementById('filter-year');
    applyFilterBtn = document.getElementById('apply-filter-btn');
    cancelFilterBtn = document.getElementById('cancel-filter-btn');

    // --- កំណត់ Filter ដំបូង (ខែ និង ឆ្នាំ បច្ចុប្បន្ន) ---
    const now = new Date();
    currentFilterMonth = now.getMonth(); // 0-11
    currentFilterYear = now.getFullYear();
    
    // Update <select> ឲ្យ​បង្ហាញ​តម្លៃ​បច្ចុប្បន្ន
    filterMonth.value = currentFilterMonth;
    // កំណត់ឆ្នាំបច្ចុប្បន្ន (ប្រសិនបើឆ្នាំបច្ចុប្បន្នមិនមានក្នុង list សូមបន្ថែម)
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
        filterYear.add(option, filterYear.options[0]); // បន្ថែមនៅខាងដើម
    }
    filterYear.value = currentFilterYear;


    // --- កំណត់ Event Listeners ---
    openFilterBtn.addEventListener('click', openFilterModal);
    cancelFilterBtn.addEventListener('click', closeFilterModal);
    applyFilterBtn.addEventListener('click', applyFilter);

    // --- Firebase Initialization & Auth ---
    try {
        if (!firebaseConfig.projectId) throw new Error("projectId not provided in firebase.initializeApp.");
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // កំណត់ Path ដោយប្រើ Global Variable `__app_id` (ប្រសិនបើមាន)
        const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // ប្រើតែ Path សម្រាប់ "ច្បាប់ចេញក្រៅ"
        outRequestsCollectionPath = `/artifacts/${canvasAppId}/public/data/out_requests`;
        
        console.log("Admin App (Out Only): Using Firestore Path:", outRequestsCollectionPath);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Admin App (Out Only): Firebase Auth state changed. User UID:", user.uid);
                // ចាប់ផ្តើមទាញទិន្នន័យដំបូង
                fetchFilteredData();
            } else {
                console.log("Admin App (Out Only): No user signed in. Attempting anonymous sign-in...");
                signInAnonymously(auth).catch(anonError => {
                    console.error("Admin App (Out Only): Error during automatic anonymous sign-in:", anonError);
                });
            }
        });

        // ព្យាយាម Sign In ជា Anonymous នៅពេលបើកកម្មវិធី
        await signInAnonymously(auth);

    } catch (e) {
        console.error("Admin App (Out Only): Firebase Initialization/Auth Error:", e);
        if(loadingIndicator) loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: មិនអាចតភ្ជាប់ Firebase បានទេ។ ${e.message}</p>`;
    }
});


// --- មុខងារ​ទាញ​ទិន្នន័យ​តាម Filter ---
function fetchFilteredData() {
    console.log(`Fetching 'Out Requests' data for: ${currentFilterMonth + 1}/${currentFilterYear}`);
    
    // បង្ហាញ Loading
    loadingIndicator.classList.remove('hidden');
    outPlaceholder.classList.add('hidden');
    outListContainer.innerHTML = '';

    // បញ្ឈប់ Listener ចាស់ (ប្រសិនបើមាន)
    if (outUnsubscribe) outUnsubscribe();

    // គណនា​ថ្ងៃ​ចាប់ផ្ដើម និង​ថ្ងៃ​បញ្ចប់​នៃ​ខែ​ដែល​បាន​ជ្រើសរើស
    try {
        const startDate = new Date(currentFilterYear, currentFilterMonth, 1);
        const endDate = new Date(currentFilterYear, currentFilterMonth + 1, 1);
        
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        // --- បង្កើត Query សម្រាប់តែ ច្បាប់ចេញក្រៅ ---
        // 1. ត្រូវតែ "approved"
        // 2. ត្រូវតែ​នៅ​ក្នុង​ចន្លោះ​ពេល​ដែល​បាន​ជ្រើសរើស (ផ្អែក​លើ requestedAt)
        const outQuery = query(
            collection(db, outRequestsCollectionPath),
            where("status", "==", "approved"),
            where("requestedAt", ">=", startTimestamp),
            where("requestedAt", "<", endTimestamp)
        );

        outUnsubscribe = onSnapshot(outQuery, (snapshot) => {
            console.log(`Received OUT snapshot. Size: ${snapshot.size}`);
            renderHistoryList(snapshot, outListContainer, outPlaceholder); // ហៅ Function សម្រាប់បង្ហាញ
            loadingIndicator.classList.add('hidden'); // លាក់ Loading
        }, (error) => {
            console.error("Error listening to OUT history:", error);
            outPlaceholder.innerHTML = `<p class="text-red-500">Error: មិនអាចទាញយកប្រវត្តិបានទេ ${error.message}</p>`;
            outPlaceholder.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        });

    } catch (e) {
        console.error("Error creating date query:", e);
        loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: ${e.message}</p>`;
    }
}

// --- មុខងារ​បង្ហាញ Card ក្នុង​បញ្ជី ---
// (Function នេះ​អាច​ប្រើ​ដូច​មុន ប៉ុន្តែ​យើង​ដឹង​ថា type គឺ 'out' ជានិច្ច)
function renderHistoryList(snapshot, container, placeholder) {
    if (!container || !placeholder) return;
    
    if (snapshot.empty) {
        placeholder.classList.remove('hidden');
        container.innerHTML = '';
    } else {
        placeholder.classList.add('hidden');
        container.innerHTML = '';
        
        const requests = [];
        snapshot.forEach(doc => requests.push(doc.data()));

        // រៀបចំតាមថ្ងៃស្នើសុំ (ថ្មីមុន)
        requests.sort((a, b) => {
            const timeA = a.requestedAt?.toMillis() ?? 0;
            const timeB = b.requestedAt?.toMillis() ?? 0;
            return timeB - timeA; 
        });

        requests.forEach(request => {
            container.innerHTML += renderAdminCard(request); // មិនចាំបាច់បញ្ជូន type ទេ
        });
    }
}

// --- មុខងារ​បង្កើត HTML សម្រាប់ Card នីមួយៗ ---
function renderAdminCard(request) {
    if (!request || !request.requestId) return '';

    // សម្រាប់ច្បាប់ចេញក្រៅ startDate និង endDate គឺដូចគ្នា
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
        // បើមិនទាន់ចូលមកវិញ អាចបង្ហាញថា "កំពុងនៅក្រៅ" ឬ មិនបង្ហាញអ្វីសោះ
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

// --- មុខងារ​សម្រាប់ Filter Modal ---
function openFilterModal() {
    // កំណត់​តម្លៃ​ក្នុង Modal ឲ្យ​ត្រូវ​នឹង Filter បច្ចុប្បន្ន
    filterMonth.value = currentFilterMonth;
    filterYear.value = currentFilterYear;
    filterModal.classList.remove('hidden');
}

function closeFilterModal() {
    filterModal.classList.add('hidden');
}

function applyFilter() {
    // យក​តម្លៃ​ថ្មី​ពី Modal
    currentFilterMonth = parseInt(filterMonth.value);
    currentFilterYear = parseInt(filterYear.value);
    
    // បិទ Modal
    closeFilterModal();
    
    // ហៅ​ទិន្នន័យ​ថ្មី​ដោយ​ផ្អែក​លើ Filter
    fetchFilteredData();
}
