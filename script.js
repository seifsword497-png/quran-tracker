// استيراد فايربيس السحابي
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات الاتصال بـ Firebase السحابي
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "quran-tracker-21b99.firebaseapp.com",
    projectId: "quran-tracker-21b99",
    storageBucket: "quran-tracker-21b99.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let timerInterval = null;
let secondsElapsed = 0;
let currentUser = null; 

// تخزين مؤقت للبيانات السحابية
let cloudStudents = [];
let cloudRecords = [];
let cloudHomework = [];

// جلب البيانات السحابية لحظياً (Real-time sync)
function initCloudSync() {
    // 1. مزامنة الطلاب
    onSnapshot(collection(db, "quran_students"), (snapshot) => {
        cloudStudents = [];
        snapshot.forEach((docSnap) => {
            cloudStudents.push({ id: docSnap.id, ...docSnap.data() });
        });
        updateStats();
        if (document.getElementById('students-section').style.display === 'block') renderStudents();
    });

    // 2. مزامنة سجلات التسميع
    onSnapshot(collection(db, "quran_records"), (snapshot) => {
        cloudRecords = [];
        snapshot.forEach((docSnap) => {
            cloudRecords.push({ id: docSnap.id, ...docSnap.data() });
        });
        updateStats();
        if (document.getElementById('record-section').style.display === 'block') renderRecords();
    });

    // 3. مزامنة الواجبات
    onSnapshot(collection(db, "quran_homework"), (snapshot) => {
        cloudHomework = [];
        snapshot.forEach((docSnap) => {
            cloudHomework.push({ id: docSnap.id, ...docSnap.data() });
        });
        if (document.getElementById('homework-section').style.display === 'block') renderHomework();
    });
}

// تشغيل المزامنة السحابية فوراً
initCloudSync();

// إدارة تسجيل الدخول (التحقق من المعلم أولاً)
function login() {
    const userIn = document.getElementById('loginUsername').value.trim();
    const passIn = document.getElementById('loginPassword').value.trim();

    if (!userIn || !passIn) {
        alert('الرجاء إدخال اسم المستخدم وكلمة المرور');
        return;
    }

    // فحص حساب المعلم أولاً وقبل أي شيء لتجنب أي تعليق
    if (userIn.toLowerCase() === 'admin' && passIn === '1234') {
        currentUser = { username: 'المعلم', role: 'teacher' };
        setupUserSession();
        switchTab('home');
        return;
    }

    // فحص حسابات الطلاب من السحابة
    const matchedStudent = cloudStudents.find(s => s.name === userIn && s.password === passIn);

    if (matchedStudent) {
        currentUser = { username: matchedStudent.name, role: 'student' };
        setupUserSession();
        openStudentProfile(matchedStudent.name);
        return;
    }

    alert('اسم المستخدم أو كلمة المرور غير صحيحة!');
}

function logout() {
    currentUser = null;
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('userInfoHeader').style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

function setupUserSession() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    document.getElementById('userInfoHeader').style.display = 'block';
    document.getElementById('loggedInUserTitle').innerText = `${currentUser.username} (${currentUser.role === 'teacher' ? 'المعلم' : 'طالب'})`;

    if (currentUser.role === 'student') {
        document.getElementById('teacherNav').style.display = 'none';
        document.getElementById('backToStudentsBtn').style.display = 'none';
    } else {
        document.getElementById('teacherNav').style.display = 'flex';
        document.getElementById('backToStudentsBtn').style.display = 'inline-block';
    }
}

// التنقل بين الأقسام
function switchTab(tabName) {
    document.getElementById('home-section').style.display = 'none';
    document.getElementById('students-section').style.display = 'none';
    document.getElementById('student-profile-section').style.display = 'none';
    document.getElementById('record-section').style.display = 'none';
    document.getElementById('homework-section').style.display = 'none';
    document.getElementById('backup-section').style.display = 'none';
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    if (tabName === 'home') {
        document.getElementById('home-section').style.display = 'block';
        if (event && event.target) event.target.classList.add('active');
        updateStats();
    } else if (tabName === 'students') {
        document.getElementById('students-section').style.display = 'block';
        if (event && event.target) event.target.classList.add('active');
        renderStudents();
    } else if (tabName === 'record') {
        document.getElementById('record-section').style.display = 'block';
        if (event && event.target) event.target.classList.add('active');
        populateStudentSelect();
        renderRecords();
    } else if (tabName === 'homework') {
        document.getElementById('homework-section').style.display = 'block';
        if (event && event.target) event.target.classList.add('active');
        populateHomeworkStudentSelect();
        renderHomework();
    } else if (tabName === 'backup') {
        document.getElementById('backup-section').style.display = 'block';
        if (event && event.target) event.target.classList.add('active');
    }
}

// إدارة الطلبة سحابياً
function getStudents() {
    return cloudStudents;
}

async function addStudent() {
    const name = document.getElementById('studentName').value.trim();
    const password = document.getElementById('studentPassword').value.trim();
    const start = document.getElementById('studentStart').value.trim();
    const level = document.getElementById('studentLevel').value;

    if (!name || !password || !start) {
        alert('الرجاء إدخال اسم الطالب، كلمة المرور، ونطاق الحفظ');
        return;
    }

    try {
        await addDoc(collection(db, "quran_students"), { name, password, start, level, timestamp: Date.now() });
        document.getElementById('studentName').value = '';
        document.getElementById('studentPassword').value = '';
        document.getElementById('studentStart').value = '';
        alert('تمت إضافة الطالب سحابياً بنجاح! ✨');
    } catch (e) {
        console.error("خطأ في إضافة الطالب: ", e);
        alert('حدث خطأ أثناء الحفظ السحابي.');
    }
}

function renderStudents() {
    const students = getStudents();
    const searchInput = document.getElementById('searchStudentInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const listContainer = document.getElementById('studentsList');
    listContainer.innerHTML = '';

    const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchTerm));

    if (filteredStudents.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: #775555;">لا توجد نتائج مطابقة.</p>';
        return;
    }

    filteredStudents.forEach(student => {
        listContainer.innerHTML += `
            <div class="student-item" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${student.name}</strong> <span style="font-size:0.75rem; color:#888;">(كلمة المرور: ${student.password})</span>
                    <p style="margin: 5px 0; font-size: 0.85rem; color: #666;">البداية: ${student.start} • المستوى: ${student.level}</p>
                </div>
                <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openStudentProfile('${student.name}')">ملف الطالب</button>
            </div>
        `;
    });
}

// فتح الملف الشخصي للطالب
function openStudentProfile(studentName) {
    document.getElementById('home-section').style.display = 'none';
    document.getElementById('students-section').style.display = 'none';
    document.getElementById('student-profile-section').style.display = 'block';
    
    document.getElementById('profileStudentName').innerText = studentName;

    const records = cloudRecords.filter(r => r.studentName === studentName);
    const recContainer = document.getElementById('profileRecordsList');
    recContainer.innerHTML = '';

    if (records.length === 0) {
        recContainer.innerHTML = '<p style="color: #666; font-size: 0.9rem;">لا توجد سجلات تسميع مسجلة بعد.</p>';
    } else {
        records.forEach(r => {
            let audioHtml = r.audioData ? `<audio controls src="${r.audioData}" style="width: 100%; margin-top: 5px; border-radius: 6px;"></audio>` : '';
            recContainer.innerHTML += `
                <div style="background: #f9f9f9; padding: 10px; margin-bottom: 8px; border-radius: 6px; border-right: 3px solid #27ae60;">
                    <strong>${r.surah}</strong> - <span style="color: #27ae60;">${r.evaluation}</span>
                    ${r.notes ? `<p style="margin: 3px 0; font-size: 0.85rem; color: #555;">ملاحظات: ${r.notes}</p>` : ''}
                    ${audioHtml}
                    <span style="font-size: 0.75rem; color: #888; display: block; margin-top: 5px;">التاريخ: ${r.date}</span>
                </div>
            `;
        });
    }

    const homeworks = cloudHomework.filter(hw => hw.studentName === studentName);
    const hwContainer = document.getElementById('profileHomeworkList');
    hwContainer.innerHTML = '';

    if (homeworks.length === 0) {
        hwContainer.innerHTML = '<p style="color: #666; font-size: 0.9rem;">لا توجد واجبات مسندة بعد.</p>';
    } else {
        homeworks.forEach(hw => {
            hwContainer.innerHTML += `
                <div style="background: #f9f9f9; padding: 8px; margin-bottom: 8px; border-radius: 6px; border-right: 3px solid ${hw.completed ? '#2ecc71' : '#e67e22'};">
                    <strong>${hw.type}</strong>: ${hw.target} - <span style="font-weight: bold; color: ${hw.completed ? '#27ae60' : '#e67e22'};">${hw.completed ? 'منجز ✓' : 'قيد الإنجاز ⏳'}</span>
                    <br><span style="font-size: 0.75rem; color: #888;">التاريخ: ${hw.date}</span>
                </div>
            `;
        });
    }
}

function populateStudentSelect() {
    const students = getStudents();
    const select = document.getElementById('recordStudentSelect');
    if(!select) return;
    select.innerHTML = '';
    
    if (students.length === 0) {
        select.innerHTML = '<option value="">أضف طلاباً أولاً</option>';
        return;
    }

    students.forEach(s => {
        select.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });
}

// العد الزمني للتسجيل
function startTimer() {
    secondsElapsed = 0;
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        const timerDisplay = document.getElementById('timerDisplay');
        if(timerDisplay) timerDisplay.innerText = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

// تسجيل الصوت
async function startRecording() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('متصفحك لا يدعم خاصية تسجيل الصوت');
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioElement = document.getElementById('audioPlayback');
            if(audioElement) {
                audioElement.src = audioUrl;
            }
            const recordStatus = document.getElementById('recordStatus');
            if(recordStatus) {
                recordStatus.innerHTML = '✅ اكتمل التسجيل، استمع إليه للمراجعة';
            }
        };

        mediaRecorder.start();
        startTimer();
        const recordStatus = document.getElementById('recordStatus');
        if(recordStatus) {
            recordStatus.innerHTML = '🔴 <span id="timerDisplay">00:00</span> - جاري التسجيل الآن...';
        }
    } catch (err) {
        alert('تعذر الوصول إلى الميكروفون: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        stopTimer();
    } else {
        alert('لم يتم بدء التسجيل أو أن التسجيل متوقف مسبقاً!');
    }
}

function resetRecording() {
    stopTimer();
    audioBlob = null;
    mediaRecorder = null;
    audioChunks = [];
    secondsElapsed = 0;
    const audioElement = document.getElementById('audioPlayback');
    if(audioElement) {
        audioElement.pause();
        audioElement.src = '';
    }
    const recordStatus = document.getElementById('recordStatus');
    if(recordStatus) {
        recordStatus.innerHTML = '⚪ جاهز للتسجيل';
    }
}

// إدارة سجلات التسميع والصوت سحابياً
function getRecords() {
    return cloudRecords;
}

async function saveRecord() {
    const studentSelect = document.getElementById('recordStudentSelect');
    const surahInput = document.getElementById('recordSurah');
    const evalSelect = document.getElementById('recordEvaluation');
    const notesInput = document.getElementById('recordNotes');

    const studentName = studentSelect ? studentSelect.value : '';
    const surah = surahInput ? surahInput.value.trim() : '';
    const evaluation = evalSelect ? evalSelect.value : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (!studentName || !surah) {
        alert('الرجاء اختيار الطالب وإدخال المقدار');
        return;
    }

    try {
        let audioBase64 = null;
        if (audioBlob) {
            audioBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(audioBlob);
            });
        }

        await addDoc(collection(db, "quran_records"), {
            studentName,
            surah,
            evaluation,
            notes,
            audioData: audioBase64,
            date: new Date().toLocaleDateString('en-GB'),
            timestamp: Date.now()
        });

        if(surahInput) surahInput.value = '';
        if(notesInput) notesInput.value = '';
        resetRecording();
        alert('حُفظ سجل التسميع والصوت في السحابة بنجاح! ✨');
    } catch (e) {
        console.error("خطأ في الحفظ السحابي: ", e);
        alert('حدث خطأ أثناء حفظ السجل.');
    }
}

function renderRecords() {
    const records = getRecords();
    const container = document.getElementById('recordsList');
    if(!container) return;
    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #775555;">لا توجد سجلات تسميع حالياً.</p>';
        return;
    }

    records.forEach(r => {
        let audioHtml = r.audioData ? `<audio controls src="${r.audioData}" style="width: 100%; margin-top: 5px; border-radius: 6px;"></audio>` : '';
        container.innerHTML += `
            <div class="student-item">
                <strong>${r.studentName}</strong> - <span style="color: #27ae60;">${r.evaluation}</span>
                <p style="margin: 5px 0; font-size: 0.85rem; color: #333;"><strong>المقدار:</strong> ${r.surah}</p>
                ${r.notes ? `<p style="margin: 5px 0; font-size: 0.85rem; color: #555; background: #f9f9f9; padding: 5px; border-radius: 4px;"><strong>ملاحظات:</strong> ${r.notes}</p>` : ''}
                ${audioHtml}
                <p style="margin: 5px 0; font-size: 0.75rem; color: #888;">التاريخ: ${r.date}</p>
            </div>
        `;
    });
}

// الواجبات سحابياً
function getHomework() {
    return cloudHomework;
}

function populateHomeworkStudentSelect() {
    const students = getStudents();
    const select = document.getElementById('hwStudentSelect');
    if(!select) return;
    select.innerHTML = '';
    
    if (students.length === 0) {
        select.innerHTML = '<option value="">أضف طلاباً أولاً</option>';
        return;
    }

    students.forEach(s => {
        select.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });
}

async function addHomework() {
    const studentSelect = document.getElementById('hwStudentSelect');
    const typeSelect = document.getElementById('hwType');
    const targetInput = document.getElementById('hwTarget');

    const studentName = studentSelect ? studentSelect.value : '';
    const type = typeSelect ? typeSelect.value : '';
    const target = targetInput ? targetInput.value.trim() : '';

    if (!studentName || !target) {
        alert('الرجاء اختيار الطالب وتحديد مقدار الواجب');
        return;
    }

    try {
        await addDoc(collection(db, "quran_homework"), {
            studentName,
            type,
            target,
            date: new Date().toLocaleDateString('en-GB'),
            completed: false,
            timestamp: Date.now()
        });

        if(targetInput) targetInput.value = '';
        alert('تم إسناد الواجب سحابياً بنجاح! ✨');
    } catch (e) {
        console.error("خطأ في إسناد الواجب: ", e);
        alert('حدث خطأ أثناء إسناد الواجب.');
    }
}

async function toggleHomeworkStatus(docId, currentStatus) {
    try {
        const hwRef = doc(db, "quran_homework", docId);
        await updateDoc(hwRef, { completed: !currentStatus });
    } catch (e) {
        console.error("خطأ في تحديث الواجب: ", e);
    }
}

function renderHomework() {
    const homeworks = getHomework();
    const container = document.getElementById('homeworkList');
    if(!container) return;
    container.innerHTML = '';

    if (homeworks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #775555;">لا توجد واجبات مسندة حالياً.</p>';
        return;
    }

    homeworks.forEach(hw => {
        container.innerHTML += `
            <div class="student-item" style="border-right: 4px solid ${hw.completed ? '#2ecc71' : '#e67e22'};">
                <strong>${hw.studentName}</strong> - <span style="color: #1b4d3e;">${hw.type}</span>
                <p style="margin: 5px 0; font-size: 0.85rem; color: #666;">المقدار: ${hw.target} • التاريخ: ${hw.date}</p>
                <button class="btn-primary" style="padding: 5px 10px; font-size: 0.8rem; background-color: ${hw.completed ? '#e74c3c' : '#2ecc71'};" onclick="toggleHomeworkStatus('${hw.id}', ${hw.completed})">
                    ${hw.completed ? 'إلغاء الإنجاز' : 'تم الإنجاز ✓'}
                </button>
            </div>
        `;
    });
}

// النسخ الاحتياطي والإحصائيات
function exportData() {
    const data = {
        students: cloudStudents,
        records: cloudRecords,
        homework: cloudHomework,
        exportDate: new Date().toLocaleDateString('ar-EG')
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `quran_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importData(event) {
    alert('البيانات الآن مُدارة سحابياً بالكامل عبر Firebase لضمان المزامنة الفورية بين الأجهزة.');
}

function clearAllData() {
    alert('لحذف البيانات، يجدر إدارتها مباشرة من لوحة تحكم قاعدة البيانات السحابية لضمان الأمان.');
}

function updateStats() {
    const studentsCountEl = document.getElementById('studentsCount');
    const recordsCountEl = document.getElementById('recordsCount');
    if(studentsCountEl) studentsCountEl.innerText = cloudStudents.length;
    if(recordsCountEl) recordsCountEl.innerText = cloudRecords.length;
}

updateStats();

// ربط دالة تسجيل الدخول بالعنصر العام لتعمل بوضوح عند النقر
window.login = login;
window.logout = logout;
window.switchTab = switchTab;
window.addStudent = addStudent;
window.renderStudents = renderStudents;
window.openStudentProfile = openStudentProfile;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.resetRecording = resetRecording;
window.saveRecord = saveRecord;
window.addHomework = addHomework;
window.toggleHomeworkStatus = toggleHomeworkStatus;
window.exportData = exportData;
window.importData = importData;
window.clearAllData = clearAllData;
