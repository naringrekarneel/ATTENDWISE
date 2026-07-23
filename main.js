import { addSubject, getSubjects, deleteSubject, generateDemoData, addTimetable, getTimetables, updateLectureStatus, deleteTimetable, syncSubjectsFromTimetable, wipeAppClean, getAllLectureRecords, backupData, restoreData, exportSemesterJSON, validateSemesterJSON, importSemesterJSON } from './db.js';
import { AttendanceEngine, SchedulerEngine, HistoryEngine, AnalyticsEngine } from './engine.js';
import Chart from 'chart.js/auto';
import { Clipboard } from '@capacitor/clipboard';

// Setup current date formatting
const dateElement = document.getElementById('current-date');
if (dateElement) {
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  dateElement.textContent = new Date().toLocaleDateString('en-US', options);
}

// Onboarding Logic
const savedName = localStorage.getItem('studentName');
const dashboardGreeting = document.getElementById('dashboard-greeting');
if (savedName) {
  if (dashboardGreeting) dashboardGreeting.textContent = `Hi, ${savedName} 👋`;
} else {
  const onboardingModal = document.getElementById('onboarding-modal');
  const saveBtn = document.getElementById('save-name-btn');
  const nameInput = document.getElementById('student-name-input');
  
  if (onboardingModal) onboardingModal.style.display = 'flex';
  
  if (saveBtn && nameInput) {
    saveBtn.addEventListener('click', () => {
       const name = nameInput.value.trim();
       if (name) {
          localStorage.setItem('studentName', name);
          if (dashboardGreeting) dashboardGreeting.textContent = `Hi, ${name} 👋`;
          onboardingModal.style.display = 'none';
       }
    });
  }
}

// Theme toggling logic
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('span');

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
let currentTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeIcon.textContent = 'dark_mode';
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeIcon.textContent = 'light_mode';
  }
}

applyTheme(currentTheme);

themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', currentTheme);
  applyTheme(currentTheme);
});

// View Switching Logic
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

// Create M3 ripple effect inside the nav-icon-container
function createNavRipple(e) {
  const item = e.currentTarget;
  const container = item.querySelector('.nav-icon-container');
  if (!container) return;

  const circle = document.createElement('span');
  const diameter = Math.max(container.clientWidth, container.clientHeight);
  const radius = diameter / 2;

  const rect = container.getBoundingClientRect();
  
  let clientX = e.clientX;
  let clientY = e.clientY;
  
  if (e.type && e.type.startsWith('touch')) {
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches[0]) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }
  }

  let left, top;
  // If coordinates are present and not zero (programmatic clicks can yield 0, 0)
  if (clientX !== undefined && clientY !== undefined && (clientX !== 0 || clientY !== 0)) {
    left = clientX - rect.left - radius;
    top = clientY - rect.top - radius;
  } else {
    // Default to centering within the pill container
    left = rect.width / 2 - radius;
    top = rect.height / 2 - radius;
  }

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${left}px`;
  circle.style.top = `${top}px`;
  circle.classList.add('nav-ripple');

  const existingRipple = container.querySelector('.nav-ripple');
  if (existingRipple) {
    existingRipple.remove();
  }

  container.appendChild(circle);

  setTimeout(() => {
    circle.remove();
  }, 600);
}

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    if (!item.dataset.target) return;
    
    // Update nav state
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    
    // Trigger Material 3 ripple
    createNavRipple(e);
    
    // Switch views
    views.forEach(view => view.style.display = 'none');
    document.getElementById(item.dataset.target).style.display = 'block';
    
    if (item.dataset.target === 'dashboard-view') {
      renderDashboard();
    } else if (item.dataset.target === 'subjects-view') {
      renderSubjects();
    } else if (item.dataset.target === 'history-view') {
      renderHistory();
    } else if (item.dataset.target === 'analytics-view') {
      renderAnalytics();
    } else if (item.dataset.target === 'timetable-view') {
      initBlankGrid();
      renderSavedTimetables();
    }
  });
});

// ==========================================
// Subjects Logic
// ==========================================
const subjectsList = document.getElementById('subjects-list');
const addSubjectBtn = document.getElementById('add-subject-btn');

async function renderSubjects() {
  subjectsList.innerHTML = '<p>Loading...</p>';
  const subjects = await getSubjects('default-semester'); 
  
  if (subjects.length === 0) {
    subjectsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">No subjects added yet.<br>Click the + button to add one.</p>';
    return;
  }
  
  subjectsList.innerHTML = '';
  subjects.forEach(subject => {
    const card = document.createElement('div');
    card.className = 'schedule-item'; 
    card.style.overflow = 'hidden';
    card.innerHTML = `
      <div style="width: 8px; height: 100%; position: absolute; left: 0; top: 0; bottom: 0; background-color: ${subject.color};"></div>
      <div class="details" style="margin-left: 1rem; flex: 1;">
        <h4 style="margin: 0; font-size: 1.1rem;">${subject.name}</h4>
        <p style="margin-top: 4px; color: var(--text-secondary); font-size: 0.85rem;">Faculty: ${subject.facultyName || 'TBA'} • Target: ${subject.requiredAttendance}%</p>
      </div>
      <button class="icon-btn delete-btn" data-id="${subject.id}" style="color: #ff4444;">
        <span class="material-symbols-outlined">delete</span>
      </button>
    `;
    subjectsList.appendChild(card);
  });
  
  // Attach delete handlers
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm("Are you sure you want to delete this subject?")) {
        await deleteSubject(e.currentTarget.dataset.id);
        renderSubjects();
      }
    });
  });
}

const subjectModal = document.getElementById('subject-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalSubjName = document.getElementById('modal-subject-name');
const modalSubjTarget = document.getElementById('modal-subject-target');
const modalSubjColor = document.getElementById('modal-subject-color');

if (addSubjectBtn && subjectModal) {
  addSubjectBtn.addEventListener('click', () => {
    // Reset fields
    modalSubjName.value = '';
    modalSubjTarget.value = '75';
    // Select a random color by default
    const colors = ['#0061a4', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'];
    modalSubjColor.value = colors[Math.floor(Math.random() * colors.length)];
    
    subjectModal.style.display = 'flex';
    modalSubjName.focus();
  });
}

if (modalCancelBtn && subjectModal) {
  modalCancelBtn.addEventListener('click', () => {
    subjectModal.style.display = 'none';
  });
}

if (modalSaveBtn && subjectModal) {
  modalSaveBtn.addEventListener('click', async () => {
    const name = modalSubjName.value.trim();
    if (!name) {
      alert("Please enter a subject name.");
      modalSubjName.focus();
      return;
    }
    const target = parseInt(modalSubjTarget.value) || 75;
    const color = modalSubjColor.value || '#0061a4';

    await addSubject('default-semester', name, 'TBA', target, color, 3);
    subjectModal.style.display = 'none';
    renderSubjects();
  });
}

// ==========================================
// Manual Timetable Builder Logic (State Driven)
// ==========================================
const saveManualTimetableBtn = document.getElementById('save-manual-timetable-btn');
const mergeDownBtn = document.getElementById('merge-down-btn');
const undoMergeBtn = document.getElementById('undo-merge-btn');
const addRowBtn = document.getElementById('add-row-btn');
const removeRowBtn = document.getElementById('remove-row-btn');

let manualGrid = [];
let selectedCellCoords = null;

function initBlankGrid() {
  const days = ['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const times = ['09:15', '10:15', '11:15', '13:15', '14:15', '15:15', '16:15'];
  
  manualGrid = [];
  selectedCellCoords = null;
  
  // Header
  manualGrid.push(days.map(d => ({ text: d, rowSpan: 1, isHeader: true, hidden: false })));
  
  // Body
  times.forEach((time, rIdx) => {
    const row = [];
    days.forEach((day, cIdx) => {
      row.push({ text: cIdx === 0 ? time : '', rowSpan: 1, isHeader: false, hidden: false });
    });
    manualGrid.push(row);
  });
  
  renderManualGrid();
}

function renderManualGrid() {
  const table = document.getElementById('manual-table');
  if (!table) return;
  table.innerHTML = '';
  
  manualGrid.forEach((row, rIdx) => {
    const tr = document.createElement('tr');
    row.forEach((cell, cIdx) => {
      if (cell.hidden) return; // Skip merged cells
      
      const td = document.createElement(cell.isHeader ? 'th' : 'td');
      td.textContent = cell.text;
      if (cell.rowSpan > 1) td.rowSpan = cell.rowSpan;
      
      td.style.padding = '10px 4px';
      td.style.borderBottom = '1px solid var(--border-color)';
      td.style.borderRight = '1px solid var(--border-color)';
      
      if (cell.isHeader) {
        td.style.backgroundColor = 'rgba(0,0,0,0.05)';
      } else {
        if (cIdx === 0) {
          td.textContent = ''; // Clear default text so we don't render it twice
          td.style.fontWeight = 'bold'; // Time column
          td.style.padding = '2px';
          td.style.verticalAlign = 'middle';
          
          const timeInput = document.createElement('input');
          timeInput.type = 'time';
          timeInput.value = cell.text;
          timeInput.style.border = 'none';
          timeInput.style.background = 'transparent';
          timeInput.style.fontFamily = 'inherit';
          timeInput.style.fontWeight = 'bold';
          timeInput.style.width = '100%';
          timeInput.style.outline = 'none';
          timeInput.style.color = 'var(--text-primary)';
          timeInput.style.cursor = 'pointer';
          timeInput.style.padding = '0';
          timeInput.style.margin = '0';
          
          timeInput.addEventListener('change', (e) => {
            cell.text = e.target.value;
          });
          
          timeInput.addEventListener('click', (e) => {
            try {
              if (typeof e.target.showPicker === 'function') {
                e.target.showPicker();
              }
            } catch (err) {}
          });
          
          td.appendChild(timeInput);
        } else {
          td.contentEditable = true;
          td.textContent = cell.text;
          
          td.addEventListener('input', (e) => {
            cell.text = e.target.textContent;
          });
          
          td.addEventListener('click', () => {
            // Deselect all
            table.querySelectorAll('td, th').forEach(c => c.style.outline = 'none');
            td.style.outline = '2px solid var(--primary-color)';
            selectedCellCoords = { rIdx, cIdx };
          });
          
          // Retain outline if re-rendering after a merge
          if (selectedCellCoords && selectedCellCoords.rIdx === rIdx && selectedCellCoords.cIdx === cIdx) {
            td.style.outline = '2px solid var(--primary-color)';
          }
        }
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}

if (mergeDownBtn) {
  mergeDownBtn.addEventListener('click', () => {
    if (!selectedCellCoords) return alert("Select a cell first by clicking on it!");
    const { rIdx, cIdx } = selectedCellCoords;
    const cell = manualGrid[rIdx][cIdx];
    
    const targetRIdx = rIdx + cell.rowSpan;
    if (targetRIdx >= manualGrid.length) return alert("Cannot merge further down. End of timetable reached.");
    
    const targetCell = manualGrid[targetRIdx][cIdx];
    if (targetCell.hidden) return alert("The cell below is already hidden or part of another merge.");
    if (targetCell.rowSpan > 1) return alert("Please unmerge the cell below before merging into it.");
    
    // Perform Merge
    cell.rowSpan += targetCell.rowSpan;
    targetCell.hidden = true; // Remove from DOM mathematically
    
    renderManualGrid();
  });
}

if (undoMergeBtn) {
  undoMergeBtn.addEventListener('click', () => {
    if (!selectedCellCoords) return alert("Select a cell first by clicking on it!");
    const { rIdx, cIdx } = selectedCellCoords;
    const cell = manualGrid[rIdx][cIdx];
    
    if (cell.rowSpan === 1) return alert("This cell is not currently merged.");
    
    // Un-hide all the cells that were mathematically merged into this one
    for (let i = 1; i < cell.rowSpan; i++) {
      manualGrid[rIdx + i][cIdx].hidden = false;
    }
    
    // Reset the rowspan of the root cell
    cell.rowSpan = 1;
    
    renderManualGrid();
  });
}

if (addRowBtn) {
  addRowBtn.addEventListener('click', () => {
    const days = ['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const newRow = [];
    
    // Auto-calculate +1 hour from the previous row
    let nextTime = '14:00'; 
    if (manualGrid.length > 1) {
      const lastRow = manualGrid[manualGrid.length - 1];
      const lastTimeStr = lastRow[0].text; // e.g. "13:15"
      if (lastTimeStr) {
        let [hours, mins] = lastTimeStr.split(':').map(Number);
        if (!isNaN(hours)) {
          hours = (hours + 1) % 24;
          nextTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        }
      }
    }
    
    days.forEach((day, cIdx) => {
      newRow.push({ text: cIdx === 0 ? nextTime : '', rowSpan: 1, isHeader: false, hidden: false });
    });
    manualGrid.push(newRow);
    renderManualGrid();
  });
}

if (removeRowBtn) {
  removeRowBtn.addEventListener('click', () => {
    if (manualGrid.length <= 2) return alert("Cannot remove all rows.");
    
    // Check if any cell in the last row is hidden due to a vertical merge
    const lastRowIndex = manualGrid.length - 1;
    const lastRow = manualGrid[lastRowIndex];
    const hasMerge = lastRow.some(cell => cell.hidden);
    
    if (hasMerge) {
       return alert("Cannot remove the last row because it contains merged cells. Please undo the merge first.");
    }
    
    manualGrid.pop();
    
    // Clear selection if it was in the removed row
    if (selectedCellCoords && selectedCellCoords.rIdx === lastRowIndex) {
      selectedCellCoords = null;
    }
    
    renderManualGrid();
  });
}

  if (saveManualTimetableBtn) {
    saveManualTimetableBtn.addEventListener('click', async () => {
      const startDateInput = document.getElementById('timetable-start-date');
      const startDate = startDateInput && startDateInput.value ? startDateInput.value : null;
      
      const endDateInput = document.getElementById('timetable-end-date');
      const endDate = endDateInput && endDateInput.value ? endDateInput.value : null;

      if (!startDate || !endDate) {
        alert("Please select both a Semester Start Date and Semester End Date before saving your timetable!");
        return;
      }

      // Extract logical state into simple grid format for the DB, preserving columns
      const gridData = manualGrid.map(row => row.map(c => ''));
      for (let r = 0; r < manualGrid.length; r++) {
        for (let c = 0; c < manualGrid[r].length; c++) {
          if (!manualGrid[r][c].hidden) {
            const cell = manualGrid[r][c];
            const textToSave = `${cell.text}${cell.rowSpan > 1 ? ` [${cell.rowSpan} Hrs]` : ''}`;
            // Expand the text into merged slots so engine.js gets every hour
            for (let span = 0; span < cell.rowSpan; span++) {
               if (r + span < gridData.length) {
                 gridData[r + span][c] = textToSave;
               }
            }
          }
        }
      }
      
      const executeSave = async (mode) => {
         await addTimetable('default-semester', 'Manual Timetable', gridData, startDate, endDate);
         
         // Core Pipeline: Parse the grid and generate all history & future records!
         await SchedulerEngine.generateScheduleFromTimetable(gridData, startDate, endDate, mode);
       
         // Auto-sync Subjects: Discover new subjects and add to Subjects DB!
         await syncSubjectsFromTimetable(gridData);
         initBlankGrid(); 
         renderSavedTimetables();
         
         // Navigate them to history to see their generated data
         document.querySelector('.nav-item[data-target="subjects-view"]').click();
      };
      
      const existingRecords = await getAllLectureRecords();
      if (existingRecords.length > 0) {
         await executeSave('continue');
      } else {
         await executeSave('wipe');
      }
    });
  }

  const pasteTimetableBtn = document.getElementById('paste-timetable-btn');
  if (pasteTimetableBtn) {
    pasteTimetableBtn.addEventListener('click', async () => {
      try {
        let text = '';
        try {
          const { value } = await Clipboard.read();
          text = value;
        } catch(e) {
          console.warn('Capacitor Clipboard read failed, falling back to navigator API:', e);
          text = await navigator.clipboard.readText();
        }
        if (!text) return;
        
        const lines = text.trim().split('\n');
        if (lines.length === 0) return;
        
        initBlankGrid(); 
        const rowLimit = Math.min(lines.length, manualGrid.length);
        
        for (let r = 0; r < rowLimit; r++) {
          const cols = lines[r].split('\t');
          const colLimit = Math.min(cols.length, manualGrid[r].length);
          for (let c = 0; c < colLimit; c++) {
            if (manualGrid[r][c].hidden) continue; 
            
            let cellText = cols[c].trim();
            let rowSpan = 1;
            
            const hrsMatch = cellText.match(/\[(\d+)\s*Hrs\]/i);
            if (hrsMatch) {
              rowSpan = parseInt(hrsMatch[1]);
              cellText = cellText.replace(hrsMatch[0], '').trim();
            }
            
            manualGrid[r][c].text = cellText;
            manualGrid[r][c].rowSpan = rowSpan;
            
            if (rowSpan > 1) {
              for (let span = 1; span < rowSpan; span++) {
                if (r + span < manualGrid.length) {
                  manualGrid[r + span][c].hidden = true;
                  manualGrid[r + span][c].text = cellText;
                }
              }
            }
          }
        }
        
        renderManualGrid();
        
        const originalText = pasteTimetableBtn.innerHTML;
        pasteTimetableBtn.innerHTML = '<span class="material-symbols-outlined">check</span> Pasted!';
        setTimeout(() => { pasteTimetableBtn.innerHTML = originalText; }, 2000);
      } catch (err) {
        console.error('Failed to read clipboard: ', err);
        alert('Failed to read from clipboard. Make sure you grant paste permissions.');
      }
    });
  }
  
  // ==========================================
  // Render Saved Timetables
  // ==========================================
async function renderSavedTimetables() {
  const container = document.getElementById('timetables-container');
  if (!container) return;
  
  container.innerHTML = '<p>Loading...</p>';
  const timetables = await getTimetables('default-semester');
  
  if (timetables.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No timetables saved yet.</p>';
    return;
  }
  
  container.innerHTML = '';
  timetables.forEach(tt => {
    const card = document.createElement('div');
    card.className = 'insight-card';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'stretch';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <div>
          <h4 style="margin-bottom: 0.25rem;">${tt.name}</h4>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">Active Schedule • ${tt.gridData.length} rows</p>
        </div>
          <div style="display: flex; gap: 8px;">
            <button class="icon-btn copy-saved-timetable-btn" data-id="${tt.id}" style="color: var(--primary-color); background: var(--surface-color); border: 1px solid var(--primary-color); padding: 6px; border-radius: 8px;">
              <span class="material-symbols-outlined" style="font-size: 1.2rem;">content_copy</span>
            </button>
            <button class="icon-btn delete-timetable-btn" data-id="${tt.id}" style="color: #ff4444; background: rgba(255, 68, 68, 0.1); padding: 6px; border-radius: 8px; border: none;">
              <span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span>
            </button>
          </div>
      </div>
      <div style="overflow-x: auto; background: var(--surface-color); border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.75rem;">
          ${tt.gridData.map((row, i) => `
            <tr>
              ${row.map(cell => `<${i===0?'th':'td'} style="padding: 6px; border-bottom: 1px solid var(--border-color);">${cell}</${i===0?'th':'td'}>`).join('')}
            </tr>
          `).join('')}
        </table>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Attach delete handlers
    document.querySelectorAll('.delete-timetable-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm("Are you sure you want to delete this timetable? This will permanently wipe all your subjects and attendance history!")) {
          await wipeAppClean();
          window.location.reload();
        }
      });
    });

    // Attach copy handlers
    document.querySelectorAll('.copy-saved-timetable-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        const tt = timetables.find(t => t.id === id);
        if (tt && tt.gridData) {
          const copyText = tt.gridData.map(row => row.join('\t')).join('\n');
          try {
            await Clipboard.write({ string: copyText });
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 1.2rem;">check</span>';
            setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
          } catch (err) {
            console.warn('Capacitor Clipboard write failed, falling back to navigator API:', err);
            navigator.clipboard.writeText(copyText).then(() => {
              const originalHtml = btn.innerHTML;
              btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 1.2rem;">check</span>';
              setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
            }).catch(e => {
              console.error('Failed to copy: ', e);
              alert('Failed to copy timetable to clipboard.');
            });
          }
        }
      });
    });
}

// ==========================================
// App Initialization & Dashboard Rendering
// ==========================================
let currentDashboardDate = null;

async function renderDashboard(dateString = null) {
  if (!dateString) {
    const d = new Date();
    dateString = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  currentDashboardDate = dateString;
  const insights = await AttendanceEngine.generateDashboardInsights(dateString);
  
  // Update UI Elements
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
      const [y, m, d] = dateString.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      dateElement.textContent = dateObj.toLocaleDateString('en-US', options);
    }
    
    const percentageEl = document.querySelector('.percentage');
    const insightTextEl = document.querySelector('.insight-card p');
  const scheduleListEl = document.querySelector('.schedule-list');
  const datePickerEl = document.getElementById('dashboard-date-picker');
  
  if (datePickerEl && datePickerEl.value !== dateString) {
    datePickerEl.value = dateString;
  }
  
  if (percentageEl) percentageEl.textContent = `${insights.overallPercentage}%`;
  if (insightTextEl) insightTextEl.innerHTML = insights.smartInsight;
  
  if (scheduleListEl && insights.schedule) {
    scheduleListEl.innerHTML = '';
    
    if (insights.schedule.length === 0) {
      // Check if it's today
      const todayD = new Date();
      const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`;
      let dayText = dateString === todayStr ? 'today' : 'this date';
      scheduleListEl.innerHTML = `<p style="text-align:center; color:var(--text-secondary); margin-top:1rem;">No lectures scheduled for ${dayText}.</p>`;
    }
    
    insights.schedule.forEach(lec => {
      const el = document.createElement('div');
      el.className = `schedule-item ${lec.status === 'present' ? 'active-class' : ''}`;
      el.dataset.id = lec.id;
      el.dataset.status = lec.status;
      
      let statusHtml = '';
      if (lec.status === 'pending') {
        statusHtml = `
          <div style="display: flex; gap: 8px;">
            <button class="mark-present-btn icon-btn" data-id="${lec.id}" style="background: #4caf50; color: white;"><span class="material-symbols-outlined">check</span></button>
            <button class="mark-absent-btn icon-btn" data-id="${lec.id}" style="background: #f44336; color: white;"><span class="material-symbols-outlined">close</span></button>
          </div>
        `;
      } else {
        const color = lec.status === 'present' ? '#4caf50' : (lec.status === 'absent' ? '#f44336' : 'gray');
        statusHtml = `<div class="status-indicator" style="background: ${color}; opacity: 1;"></div>`;
      }
      let roomHtml = lec.room ? `<span style="display:inline-flex; align-items:center; gap:2px; color:var(--primary-color); font-weight:600; margin-left: 4px;"><span class="material-symbols-outlined" style="font-size:12px;">location_on</span>${lec.room}</span>` : '';
        
        el.innerHTML = `
          <div class="time" style="min-width: 65px; font-weight:bold;">${lec.time}</div>
          <div class="details" style="flex:1; margin-left: 10px;">
            <h4 style="display:flex; align-items:center;">${lec.name} ${roomHtml}</h4>
            <p>${lec.faculty || 'TBA'} • <span style="text-transform:uppercase; font-size: 0.75rem; font-weight:bold;">${lec.status}</span></p>
          </div>
          ${statusHtml}
        `;
      scheduleListEl.appendChild(el);
    });
    
    // Attach attendance event listeners
    document.querySelectorAll('.mark-present-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        await updateLectureStatus(e.currentTarget.dataset.id, 'present');
        renderDashboard(currentDashboardDate);
      });
    });
    
    document.querySelectorAll('.mark-absent-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        await updateLectureStatus(e.currentTarget.dataset.id, 'absent');
        renderDashboard(currentDashboardDate);
      });
    });
    
    // Long press logic to revert status
    document.querySelectorAll('.schedule-item').forEach(item => {
      if (item.dataset.status === 'pending') return;
      
      let pressTimer;
      const startPress = () => {
        item.style.transform = 'scale(0.98)';
        pressTimer = setTimeout(async () => {
          if (navigator.vibrate) navigator.vibrate(50);
          item.style.transform = 'scale(1)';
          await updateLectureStatus(item.dataset.id, 'pending');
          renderDashboard(currentDashboardDate);
        }, 600);
      };
      
      const cancelPress = () => {
        clearTimeout(pressTimer);
        item.style.transform = 'scale(1)';
      };
      
      item.addEventListener('touchstart', startPress, {passive: true});
      item.addEventListener('touchend', cancelPress);
      item.addEventListener('touchmove', cancelPress, {passive: true});
      item.addEventListener('mousedown', startPress);
      item.addEventListener('mouseup', cancelPress);
      item.addEventListener('mouseleave', cancelPress);
    });
  }
}

async function initApp() {
  await generateDemoData(); // Hydrate DB if empty
  await SchedulerEngine.syncTodayLectures();
  
  await renderDashboard(null);
  
  // Attach date picker listener
  const datePicker = document.getElementById('dashboard-date-picker');
  if (datePicker) {
    datePicker.addEventListener('change', (e) => {
      const selectedDate = e.target.value;
      const titleEl = document.getElementById('schedule-title');
      if (titleEl) {
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        titleEl.textContent = selectedDate === todayStr ? "Today's Schedule" : "Schedule";
      }
      renderDashboard(selectedDate);
    });
  }

  const prevDateBtn = document.getElementById('prev-date-btn');
  if (prevDateBtn && datePicker) {
    prevDateBtn.addEventListener('click', () => {
      if (!datePicker.value) return;
      const d = new Date(datePicker.value);
      d.setDate(d.getDate() - 1);
      const newDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      datePicker.value = newDateStr;
      datePicker.dispatchEvent(new Event('change'));
    });
  }

  const nextDateBtn = document.getElementById('next-date-btn');
  if (nextDateBtn && datePicker) {
    nextDateBtn.addEventListener('click', () => {
      if (!datePicker.value) return;
      const d = new Date(datePicker.value);
      d.setDate(d.getDate() + 1);
      const newDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      datePicker.value = newDateStr;
      datePicker.dispatchEvent(new Event('change'));
    });
  };
}
window.renderDashboard = () => renderDashboard(currentDashboardDate);

// Bootstrap the application on load
initApp();

// ==========================================
// Analytics & Charts Engine
// ==========================================
let barChartInstance = null;
let donutChartInstance = null;
let currentAnalyticsMonthKey = null;

async function renderAnalytics(targetMonthKey = null, slideDirection = null) {
  const data = await AnalyticsEngine.getAnalyticsData(targetMonthKey);
  const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#e2e2e6' : '#1a1c1e';
  
  currentAnalyticsMonthKey = data.activeMonthKey;
  
  // Set overall percentage
  const overallPercentEl = document.getElementById('analytics-overall-percent');
  if (overallPercentEl) {
    overallPercentEl.textContent = `${data.overallPercentage.toFixed(1)}%`;
  }
  
  // Update Chart Title
  const weeklyTitle = document.getElementById('analytics-weekly-title');
  if (weeklyTitle) {
    weeklyTitle.textContent = `${data.currentMonthName} Attendance Trend`;
  }
  
  // Update Month Chooser
  const monthSlider = document.getElementById('month-chooser-slider');
  const monthLabel = document.getElementById('month-chooser-label');
  const prevBtn = document.getElementById('month-prev-btn');
  const nextBtn = document.getElementById('month-next-btn');
  
  if (monthSlider && monthLabel) {
     const currentIndex = data.availableMonths.findIndex(m => m.key === currentAnalyticsMonthKey);
     const currentMonthObj = data.availableMonths[currentIndex];
     
     // Handle Slide Animation
     if (slideDirection) {
        // Clone the slider to animate it out
        const oldSlider = monthSlider.cloneNode(true);
        oldSlider.id = ''; // remove id to prevent conflict
        monthSlider.parentNode.appendChild(oldSlider);
        
        // Setup new slider
        monthLabel.textContent = currentMonthObj ? currentMonthObj.label : data.currentMonthName;
        monthSlider.classList.add(slideDirection === 'left' ? 'slide-right' : 'slide-left');
        
        // Trigger reflow
        void monthSlider.offsetWidth;
        
        // Animate
        monthSlider.classList.remove('slide-right', 'slide-left');
        oldSlider.classList.add(slideDirection === 'left' ? 'slide-left' : 'slide-right');
        
        setTimeout(() => {
           if (oldSlider.parentNode) oldSlider.parentNode.removeChild(oldSlider);
        }, 300); // matches CSS transition duration
     } else {
        monthLabel.textContent = currentMonthObj ? currentMonthObj.label : data.currentMonthName;
     }
     
     // Setup buttons
     if (prevBtn) {
        const hasPrev = currentIndex > 0;
        prevBtn.style.opacity = hasPrev ? '1' : '0.3';
        prevBtn.style.pointerEvents = hasPrev ? 'auto' : 'none';
        prevBtn.onclick = () => {
           if (hasPrev) renderAnalytics(data.availableMonths[currentIndex - 1].key, 'left');
        };
     }
     
     if (nextBtn) {
        const hasNext = currentIndex < data.availableMonths.length - 1;
        nextBtn.style.opacity = hasNext ? '1' : '0.3';
        nextBtn.style.pointerEvents = hasNext ? 'auto' : 'none';
        nextBtn.onclick = () => {
           if (hasNext) renderAnalytics(data.availableMonths[currentIndex + 1].key, 'right');
        };
     }
  }

  // Set lectures remaining
  const remainingValueEl = document.getElementById('analytics-remaining-value');
  if (remainingValueEl) {
    remainingValueEl.textContent = data.lectureRemaining;
  }

  // Bunk Calculator Logic
  const bunkIcon = document.getElementById('analytics-bunk-icon');
  const bunkIconContainer = document.getElementById('analytics-bunk-icon-container');
  const bunkTitle = document.getElementById('analytics-bunk-title');
  const bunkValue = document.getElementById('analytics-bunk-value');
  
  if (bunkValue) {
    const reqSeat = data.requiredToSeat;
    if (reqSeat <= 0) {
      // Safe to bunk
      const safeBunks = Math.abs(reqSeat);
      if (bunkTitle) bunkTitle.textContent = "Safe Bunks";
      bunkValue.textContent = safeBunks;
      if (bunkIcon) bunkIcon.textContent = "check_circle";
      if (bunkIconContainer) {
        bunkIconContainer.style.background = 'rgba(52, 168, 83, 0.15)';
        bunkIconContainer.style.color = '#34a853';
      }
    } else {
      // Must attend
      if (bunkTitle) bunkTitle.textContent = "Required Classes";
      bunkValue.textContent = reqSeat;
      if (bunkIcon) bunkIcon.textContent = "warning";
      if (bunkIconContainer) {
        bunkIconContainer.style.background = 'rgba(234, 67, 53, 0.15)';
        bunkIconContainer.style.color = '#ea4335';
      }
    }
  }

  // Render Subject Breakdown Table
  const subjectStats = data.subjectStats || [];
  const subjectBody = document.getElementById('analytics-subject-breakdown-body');
  if (subjectBody) {
    if (subjectStats.length === 0) {
      subjectBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No subjects recorded yet. Set up your timetable first!</td></tr>`;
    } else {
      subjectBody.innerHTML = subjectStats.map(sub => {
        const percentVal = sub.percentage;
        const barColor = percentVal >= sub.required ? '#34a853' : (percentVal >= 50 ? '#fbbc05' : '#ea4335');
        const statusClass = percentVal >= sub.required ? 'status-safe' : 'status-danger';
        const statusText = percentVal >= sub.required ? 'On Track' : 'Low';
        return `
          <tr>
            <td>
              <div class="subject-badge">
                <span class="subject-color-dot" style="background-color: ${sub.color}"></span>
                <span>${sub.name}</span>
              </div>
            </td>
            <td>${sub.attended}</td>
            <td>${sub.total}</td>
            <td>
              <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${Math.min(percentVal, 100)}%; background-color: ${barColor};"></div>
              </div>
            </td>
            <td style="font-weight: 700;">${percentVal.toFixed(1)}%</td>
            <td>
              <span class="status-badge-modern ${statusClass}">${statusText}</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Render Week Table
  const weekTable = document.getElementById('analytics-week-table');
  if (weekTable) {
    let weekHtml = `
      <thead>
        <tr>
          <th>Week</th>
          <th>Attended</th>
          <th>Total</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
    `;
    data.weeklyData.forEach((w) => {
      weekHtml += `
        <tr>
          <td>Week ${w.week}</td>
          <td>${w.attended}</td>
          <td>${w.total}</td>
          <td style="font-weight: 700;">${w.percentage.toFixed(1)}%</td>
        </tr>
      `;
    });
    weekHtml += '</tbody>';
    weekTable.innerHTML = weekHtml;
  }
  
  // Render Month Table
  const monthTable = document.getElementById('analytics-month-table');
  if (monthTable) {
    monthTable.innerHTML = `
      <thead>
        <tr>
          <th>Metric</th>
          <th style="text-align: right;">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Total Attended (Overall)</td>
          <td style="text-align: right; font-weight: 700;">${data.overallAttended}</td>
        </tr>
        <tr>
          <td>Total Classes (Overall)</td>
          <td style="text-align: right; font-weight: 700;">${data.overallTotal}</td>
        </tr>
        <tr>
          <td>Overall Percentage</td>
          <td style="text-align: right; font-weight: 700;">${data.overallPercentage.toFixed(1)}%</td>
        </tr>
        <tr>
          <td>Lectures Remaining</td>
          <td style="text-align: right; font-weight: 700;">${data.lectureRemaining}</td>
        </tr>
      </tbody>
    `;
  }
  
  // Render Bar Chart
  const barCanvas = document.getElementById('weekly-bar-chart');
  if (barCanvas) {
    if (barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: data.weeklyData.map(w => `Week ${w.week}`),
        datasets: [{
          data: data.weeklyData.map(w => w.percentage),
          backgroundColor: '#0061a4',
          borderRadius: 8,
          barThickness: 20
        }]
      },
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: { min: 0, max: 100, ticks: { stepSize: 25, color: textColor } }
        }
      }
    });
  }
  
  // Render Donut Chart
  const donutCanvas = document.getElementById('monthly-donut-chart');
  if (donutCanvas) {
    if (donutChartInstance) donutChartInstance.destroy();
    
    const hasData = subjectStats.some(s => s.total > 0);
    const chartLabels = hasData ? subjectStats.map(s => s.name) : ['No Data'];
    const chartData = hasData ? subjectStats.map(s => s.total) : [1];
    const chartColors = hasData ? subjectStats.map(s => s.color) : ['#bbc7db'];
    
    donutChartInstance = new Chart(donutCanvas, {
      type: 'doughnut',
      data: {
        labels: chartLabels, 
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderWidth: 0,
          cutout: '65%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: function(context) { 
                return ` ${context.label}: ${context.raw} classes`; 
              }
            }
          }
        }
      }
    });
  }
}

window.calState = window.calState || {
  date: new Date(),
  selectedStr: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })()
};

async function renderHistory() {
  const calGrid = document.getElementById('calendar-grid');
  const detailsContainer = document.getElementById('day-details-container');
  if (!calGrid || !detailsContainer) return;
  
  const data = await HistoryEngine.getSpreadsheetData();
  const recordsMap = {};
  data.rows.forEach(r => recordsMap[r.rawDate] = r);
  
  const year = window.calState.date.getFullYear();
  const month = window.calState.date.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  let gridHtml = '';
  // Empty slots before 1st of month
  for (let i = 0; i < firstDay; i++) {
    gridHtml += `<div></div>`;
  }
  
  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const row = recordsMap[dateStr];
    
    let isSelected = window.calState.selectedStr === dateStr;
    let bgStyle = isSelected ? 'background: var(--primary-color); color: white;' : 'background: transparent; color: var(--text-primary);';
    
    let dotHtml = '';
    if (row) {
       const activeLecs = row.lectures.filter(l => l.active);
       if (activeLecs.length > 0) {
         let dotColor = '#fbbc05'; // yellow partial
         if (row.attendedCount === row.totalCount && row.totalCount > 0) dotColor = 'var(--success-color)';
         else if (row.attendedCount === 0 && row.totalCount > 0) dotColor = 'var(--danger-color)';
         dotHtml = `<div style="width: 4px; height: 4px; border-radius: 50%; background: ${dotColor}; margin: 2px auto 0;"></div>`;
       }
    }
    
    gridHtml += `
      <div class="cal-day" data-date="${dateStr}" style="padding: 8px 2px; cursor: pointer; border-radius: 6px; ${bgStyle}">
        <div style="font-size: 0.9rem; font-weight: 500;">${day}</div>
        ${dotHtml}
      </div>
    `;
  }
  
  calGrid.innerHTML = gridHtml;
  
  // Render details for selected day
  const selectedRow = recordsMap[window.calState.selectedStr];
  let detailsHtml = '';
  
  if (selectedRow) {
    const activeLecs = selectedRow.lectures.filter(l => l.active);
    if (activeLecs.length > 0) {
       detailsHtml += `
         <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">Classes for ${selectedRow.date}</h4>
         <div style="display: flex; flex-direction: column; gap: 8px;">
       `;
       activeLecs.forEach(lec => {
          const isAttended = lec.attended;
          const statusColor = isAttended ? 'var(--success-color)' : 'var(--danger-color)';
          const checkedAttr = isAttended ? 'checked' : '';
          
          detailsHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--surface-color); border-radius: 8px; border-left: 4px solid ${statusColor}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <h4 style="margin: 0; font-size: 0.95rem; color: var(--text-primary); font-weight: 500;">${lec.name}</h4>
              <label style="display: flex; align-items: center; cursor: pointer; margin: 0;">
                <input type="checkbox" class="history-checkbox" data-id="${lec.id}" ${checkedAttr} style="width: 22px; height: 22px; accent-color: var(--primary-color); cursor: pointer; margin: 0;">
              </label>
            </div>
          `;
       });
       detailsHtml += `</div>`;
    } else {
       detailsHtml = `<p style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">No classes scheduled for this day.</p>`;
    }
  } else {
    detailsHtml = `<p style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">No classes scheduled for this day.</p>`;
  }
  
  detailsContainer.innerHTML = detailsHtml;
  
  // Attach Event Listeners
  calGrid.querySelectorAll('.cal-day').forEach(el => {
     el.addEventListener('click', () => {
        window.calState.selectedStr = el.dataset.date;
        renderHistory();
     });
  });
  
  detailsContainer.querySelectorAll('.history-checkbox').forEach(cb => {
     cb.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const isChecked = e.target.checked;
        const newStatus = isChecked ? 'present' : 'absent';
        await updateLectureStatus(id, newStatus);
        renderHistory();
     });
  });
  
  // Prev/Next handlers
  const prevBtn = document.getElementById('cal-prev-btn');
  const nextBtn = document.getElementById('cal-next-btn');
  
  const newPrev = prevBtn.cloneNode(true);
  const newNext = nextBtn.cloneNode(true);
  prevBtn.parentNode.replaceChild(newPrev, prevBtn);
  nextBtn.parentNode.replaceChild(newNext, nextBtn);
  
  newPrev.addEventListener('click', () => {
     window.calState.date.setMonth(window.calState.date.getMonth() - 1);
     renderHistory();
  });
  newNext.addEventListener('click', () => {
     window.calState.date.setMonth(window.calState.date.getMonth() + 1);
     renderHistory();
  });
}
window.renderHistory = renderHistory;

// ==========================================
// Settings, Backup & Restore
// ==========================================
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('modal-settings-cancel-btn');
const backupBtn = document.getElementById('modal-backup-btn');
const restoreBtn = document.getElementById('modal-restore-btn');
const restoreFileInput = document.getElementById('restore-file-input');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      // Hide all views
      const views = document.querySelectorAll('.view');
      views.forEach(view => view.style.display = 'none');
      
      // Deactivate all nav items
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(nav => nav.classList.remove('active'));
      
      // Show settings view
      const settingsView = document.getElementById('settings-view');
      if (settingsView) settingsView.style.display = 'block';
    });
  }

if (backupBtn) {
  backupBtn.addEventListener('click', async () => {
    try {
      backupBtn.style.opacity = '0.7';
      backupBtn.innerText = 'Preparing Backup...';
      
      const jsonString = await backupData();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `AttendWise_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      alert('Backup downloaded successfully! Please save this file in Google Drive or a safe place.');
    } catch (err) {
      alert('Failed to generate backup: ' + err.message);
    } finally {
      backupBtn.style.opacity = '1';
      backupBtn.innerHTML = '<div style="font-weight: 700; font-size: 1.05rem; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; color: var(--primary-color);"><span class="material-symbols-outlined">download</span> Backup Data to File</div><div style="font-size: 0.85rem;">Export a .json file you can save to Google Drive.</div>';
    }
  });
}

if (restoreBtn && restoreFileInput) {
  restoreBtn.addEventListener('click', () => {
    restoreFileInput.click();
  });
  
  restoreFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      await restoreData(text);
      
      alert('Data restored successfully! The app will now reload.');
      window.location.reload();
    } catch (err) {
      alert('Failed to restore data. Please make sure you selected a valid AttendWise backup JSON file.');
      console.error(err);
    }
    
    // Clear input
    e.target.value = '';
  });
}

// ==========================================
// JSON Semester Sync Modal Handlers
// ==========================================
const jsonModal = document.getElementById('json-modal');
const jsonModalBtn = document.getElementById('json-modal-btn');
const modalJsonSyncBtn = document.getElementById('modal-json-sync-btn');
const jsonModalClose = document.getElementById('json-modal-close');

const jsonTabExport = document.getElementById('json-tab-export');
const jsonTabImport = document.getElementById('json-tab-import');
const jsonExportContainer = document.getElementById('json-export-container');
const jsonImportContainer = document.getElementById('json-import-container');

const jsonExportText = document.getElementById('json-export-text');
const jsonCopyBtn = document.getElementById('json-copy-btn');
const jsonDownloadBtn = document.getElementById('json-download-btn');

const jsonUploadTrigger = document.getElementById('json-upload-trigger');
const jsonFileInput = document.getElementById('json-file-input');
const jsonPasteClipboard = document.getElementById('json-paste-clipboard');
const jsonImportText = document.getElementById('json-import-text');

const jsonValidationStatus = document.getElementById('json-validation-status');
const jsonImportPreview = document.getElementById('json-import-preview');
const previewSubjCount = document.getElementById('preview-subj-count');
const previewSlotCount = document.getElementById('preview-slot-count');
const previewSubjChips = document.getElementById('preview-subj-chips');
const jsonConfirmImportBtn = document.getElementById('json-confirm-import-btn');

async function openJSONModal(tab = 'export') {
  if (!jsonModal) return;

  if (tab === 'export') {
    switchJSONTab('export');
    const exportedData = await exportSemesterJSON();
    if (jsonExportText) jsonExportText.value = exportedData;
  } else {
    switchJSONTab('import');
  }

  jsonModal.style.display = 'flex';
}

function switchJSONTab(targetTab) {
  if (targetTab === 'export') {
    jsonTabExport.style.background = 'var(--surface-color)';
    jsonTabExport.style.color = 'var(--text-primary)';
    jsonTabImport.style.background = 'transparent';
    jsonTabImport.style.color = 'var(--text-secondary)';
    jsonExportContainer.style.display = 'flex';
    jsonImportContainer.style.display = 'none';
  } else {
    jsonTabImport.style.background = 'var(--surface-color)';
    jsonTabImport.style.color = 'var(--text-primary)';
    jsonTabExport.style.background = 'transparent';
    jsonTabExport.style.color = 'var(--text-secondary)';
    jsonImportContainer.style.display = 'flex';
    jsonExportContainer.style.display = 'none';
  }
}

if (jsonModalBtn) jsonModalBtn.addEventListener('click', () => openJSONModal('export'));
if (modalJsonSyncBtn) modalJsonSyncBtn.addEventListener('click', () => openJSONModal('export'));
if (jsonModalClose) jsonModalClose.addEventListener('click', () => jsonModal.style.display = 'none');

if (jsonTabExport) jsonTabExport.addEventListener('click', () => openJSONModal('export'));
if (jsonTabImport) jsonTabImport.addEventListener('click', () => switchJSONTab('import'));

if (jsonCopyBtn) {
  jsonCopyBtn.addEventListener('click', async () => {
    const text = jsonExportText.value;
    if (!text) return;
    try {
      await Clipboard.write({ string: text });
    } catch(e) {
      await navigator.clipboard.writeText(text);
    }
    const orig = jsonCopyBtn.innerHTML;
    jsonCopyBtn.innerHTML = '<span class="material-symbols-outlined">check</span> Copied!';
    setTimeout(() => { jsonCopyBtn.innerHTML = orig; }, 2000);
  });
}

if (jsonDownloadBtn) {
  jsonDownloadBtn.addEventListener('click', () => {
    const text = jsonExportText.value;
    if (!text) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AttendWise_Semester_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  });
}

function handleJSONValidationUpdate(inputVal) {
  if (!inputVal || !inputVal.trim()) {
    jsonValidationStatus.style.display = 'none';
    jsonImportPreview.style.display = 'none';
    jsonConfirmImportBtn.disabled = true;
    jsonConfirmImportBtn.style.opacity = '0.5';
    jsonConfirmImportBtn.style.cursor = 'not-allowed';
    return;
  }

  const result = validateSemesterJSON(inputVal);

  if (result.valid) {
    jsonValidationStatus.style.display = 'block';
    jsonValidationStatus.style.background = 'rgba(76, 175, 80, 0.15)';
    jsonValidationStatus.style.border = '1px solid #4caf50';
    jsonValidationStatus.style.color = '#4caf50';
    jsonValidationStatus.innerHTML = '<div style="font-weight:700; display:flex; align-items:center; gap:6px;"><span class="material-symbols-outlined" style="font-size:1.1rem;">check_circle</span> JSON Validated Successfully</div>';

    if (result.warnings && result.warnings.length > 0) {
      jsonValidationStatus.innerHTML += `<div style="font-size:0.8rem; margin-top:4px; opacity:0.9;">${result.warnings.join('<br>')}</div>`;
    }

    if (result.preview) {
      jsonImportPreview.style.display = 'block';
      previewSubjCount.textContent = result.preview.subjectsCount;
      previewSlotCount.textContent = result.preview.timetableCount;

      previewSubjChips.innerHTML = result.preview.subjects.map(s => `
        <span style="background: ${s.color || '#0061a4'}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
          ${s.name} (${s.code || s.id})
        </span>
      `).join('');
    }

    jsonConfirmImportBtn.disabled = false;
    jsonConfirmImportBtn.style.opacity = '1';
    jsonConfirmImportBtn.style.cursor = 'pointer';
  } else {
    jsonValidationStatus.style.display = 'block';
    jsonValidationStatus.style.background = 'rgba(244, 67, 54, 0.15)';
    jsonValidationStatus.style.border = '1px solid #f44336';
    jsonValidationStatus.style.color = '#f44336';
    jsonValidationStatus.innerHTML = `
      <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px;">
        <span class="material-symbols-outlined" style="font-size:1.1rem;">error</span> Validation Errors Detected:
      </div>
      <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.8rem;">
        ${result.errors.map(err => `<li>${err}</li>`).join('')}
      </ul>
    `;
    jsonImportPreview.style.display = 'none';
    jsonConfirmImportBtn.disabled = true;
    jsonConfirmImportBtn.style.opacity = '0.5';
    jsonConfirmImportBtn.style.cursor = 'not-allowed';
  }
}

if (jsonImportText) {
  jsonImportText.addEventListener('input', (e) => {
    handleJSONValidationUpdate(e.target.value);
  });
}

if (jsonUploadTrigger && jsonFileInput) {
  jsonUploadTrigger.addEventListener('click', () => jsonFileInput.click());
  jsonFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      jsonImportText.value = text;
      handleJSONValidationUpdate(text);
    } catch(err) {
      alert("Failed to read JSON file: " + err.message);
    }
    e.target.value = '';
  });
}

if (jsonPasteClipboard) {
  jsonPasteClipboard.addEventListener('click', async () => {
    try {
      let text = '';
      try {
        const { value } = await Clipboard.read();
        text = value;
      } catch(e) {
        text = await navigator.clipboard.readText();
      }
      if (text) {
        jsonImportText.value = text;
        handleJSONValidationUpdate(text);
      }
    } catch(err) {
      alert("Failed to paste from clipboard. Please grant permission or paste directly into the box.");
    }
  });
}

if (jsonConfirmImportBtn) {
  jsonConfirmImportBtn.addEventListener('click', async () => {
    const text = jsonImportText.value;
    if (!text) return;
    if (!confirm("Importing this semester JSON will replace your current timetable and subject list. Do you wish to proceed?")) return;

    try {
      jsonConfirmImportBtn.disabled = true;
      jsonConfirmImportBtn.innerText = "Applying Semester Import...";
      await importSemesterJSON(text);

      alert("Semester JSON imported successfully!");
      jsonModal.style.display = 'none';

      // Refresh active view
      if (window.renderDashboard) window.renderDashboard();
      if (window.renderSubjects) window.renderSubjects();
      window.location.reload();
    } catch(err) {
      alert("Failed to import semester JSON: " + err.message);
      jsonConfirmImportBtn.disabled = false;
      jsonConfirmImportBtn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Confirm & Apply Semester Import';
    }
  });
}