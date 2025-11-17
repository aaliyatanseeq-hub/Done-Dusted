// Event Intelligence Platform - Frontend JavaScript
// Production Ready - Works with Render deployment

// API Base URL - Auto-detect for production
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8000/api' 
    : '/api'; // Relative path for production

// Global state
let currentEvents = [];
let currentAttendees = [];
let selectedUsers = new Set();
let notificationUsers = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAPIHealth();
});

function initializeApp() {
    // Set default dates
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 1);
    
    document.getElementById('startDate').value = today.toISOString().split('T')[0];
    document.getElementById('endDate').value = nextMonth.toISOString().split('T')[0];
    
    console.log('🚀 Event Intelligence Platform Initialized');
    console.log('📡 API Base URL:', API_BASE_URL);
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPhase = this.getAttribute('href').substring(1);
            switchPhase(targetPhase);
        });
    });
    
    // Event discovery
    document.getElementById('location').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') discoverEvents();
    });
    
    // Attendee discovery
    document.getElementById('manualEvent').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') discoverAttendees();
    });
    
    document.getElementById('manualEvent').addEventListener('input', function() {
        if (this.value.trim()) {
            document.getElementById('eventSelect').value = '';
        }
    });
    
    document.getElementById('eventSelect').addEventListener('change', function() {
        if (this.value) {
            document.getElementById('manualEvent').value = '';
        }
    });
    
    // Notification message
    document.getElementById('notificationMessage').addEventListener('input', function() {
        updateCharacterCount();
    });
}

async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            const data = await response.json();
            updateStatusBadge(data.status === 'healthy');
            console.log('✅ API Health:', data);
        } else {
            updateStatusBadge(false);
        }
    } catch (error) {
        console.warn('⚠️ API health check failed:', error);
        updateStatusBadge(false);
    }
}

function updateStatusBadge(healthy) {
    const statusBadge = document.getElementById('apiStatus');
    if (healthy) {
        statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> System Ready';
        statusBadge.style.color = '#2d7d32';
    } else {
        statusBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> API Unavailable';
        statusBadge.style.color = '#dc2626';
    }
}

function switchPhase(phase) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`.nav-link[href="#${phase}"]`).classList.add('active');
    
    // Update sections
    document.querySelectorAll('.phase-section').forEach(section => section.classList.remove('active'));
    document.getElementById(phase).classList.add('active');
    
    // Special handling for each phase
    if (phase === 'phase3') {
        updateNotificationTable();
    }
    
    console.log(`🔀 Switched to phase: ${phase}`);
}

// EVENT DISCOVERY
async function discoverEvents() {
    const location = document.getElementById('location').value.trim();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const maxResults = parseInt(document.getElementById('maxEvents').value);
    
    // Validation
    if (!location) {
        showError('Please enter a location');
        return;
    }
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    if (maxResults < 1 || maxResults > 100) {
        showError('Max events must be between 1 and 100');
        return;
    }
    
    showLoading(`Discovering ${maxResults} events in ${location}...`);
    
    try {
        const response = await fetch(`${API_BASE_URL}/discover-events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                location: location,
                start_date: startDate,
                end_date: endDate,
                categories: [], // Empty since we removed categories
                max_results: maxResults
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            currentEvents = result.events || [];
            displayEvents(currentEvents, result);
            updateEventDropdown(currentEvents);
            showSuccess(`Found ${result.total_events} events in ${location}`);
        } else {
            throw new Error(result.error || 'Failed to discover events');
        }
        
    } catch (error) {
        console.error('Event discovery error:', error);
        showError('Failed to discover events: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayEvents(events, metadata) {
    const tableBody = document.getElementById('eventsTableBody');
    const statsElement = document.getElementById('eventsStats');
    
    // Update stats
    statsElement.innerHTML = `
        <span>Found: ${metadata.total_events || 0}</span>
        <span>Limit: ${metadata.requested_limit || 0}</span>
    `;
    
    // Clear table
    tableBody.innerHTML = '';
    
    if (events.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #666;">
                    <i class="fas fa-calendar-times" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    No events found for your criteria
                </td>
            </tr>
        `;
    } else {
        events.forEach((event, index) => {
            const confidencePercent = Math.round((event.confidence_score || 0.5) * 100);
            const confidenceClass = getConfidenceClass(confidencePercent);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${escapeHtml(event.event_name || 'Unknown Event')}</strong>
                    ${event.hype_score > 0.7 ? ' <i class="fas fa-fire" style="color: #dc2626;"></i>' : ''}
                </td>
                <td>${escapeHtml(event.exact_date || 'Date not specified')}</td>
                <td>${escapeHtml(event.exact_venue || event.location || 'Venue not specified')}</td>
                <td><span class="engagement-badge">${escapeHtml(event.category || 'other')}</span></td>
                <td><span class="${confidenceClass}">${confidencePercent}%</span></td>
                <td>
                    <button class="btn-secondary" onclick="analyzeAttendees('${escapeHtml(event.event_name || '').replace(/'/g, "\\'")}')">
                        <i class="fas fa-users"></i>
                        Analyze
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
    
    // Show results section
    document.getElementById('eventsResults').classList.remove('hidden');
}

function updateEventDropdown(events) {
    const eventSelect = document.getElementById('eventSelect');
    
    // Clear existing options (keep the first placeholder)
    while (eventSelect.children.length > 1) {
        eventSelect.removeChild(eventSelect.lastChild);
    }
    
    // Add new options
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.event_name;
        option.textContent = event.event_name.length > 50 ? event.event_name.substring(0, 50) + '...' : event.event_name;
        eventSelect.appendChild(option);
    });
}

// ATTENDEE DISCOVERY
async function discoverAttendees() {
    const eventSelect = document.getElementById('eventSelect');
    const manualEvent = document.getElementById('manualEvent').value.trim();
    const eventDate = document.getElementById('eventDate').value.trim();
    const maxResults = parseInt(document.getElementById('maxAttendees').value);
    
    let eventName = eventSelect.value || manualEvent;
    
    // Validation
    if (!eventName.trim()) {
        showError('Please select or enter an event name');
        return;
    }
    
    if (maxResults < 1 || maxResults > 100) {
        showError('Max attendees must be between 1 and 100');
        return;
    }
    
    showLoading(`Finding ${maxResults} attendees for "${eventName}"...`);
    
    try {
        const response = await fetch(`${API_BASE_URL}/discover-attendees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                event_name: eventName,
                event_date: eventDate || null,
                max_results: maxResults
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            currentAttendees = result.attendees || [];
            displayAttendees(currentAttendees, result);
            showSuccess(`Found ${result.total_attendees} attendees for "${eventName}"`);
        } else {
            throw new Error(result.error || 'Failed to discover attendees');
        }
        
    } catch (error) {
        console.error('Attendee discovery error:', error);
        showError('Failed to discover attendees: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayAttendees(attendees, metadata) {
    const tableBody = document.getElementById('attendeesTableBody');
    const statsElement = document.getElementById('attendeesStats');
    
    // Update stats
    statsElement.innerHTML = `
        <span>Found: ${metadata.total_attendees || 0}</span>
        <span>Limit: ${metadata.requested_limit || 0}</span>
    `;
    
    // Clear table and selection
    tableBody.innerHTML = '';
    selectedUsers.clear();
    updateSelectionUI();
    
    if (attendees.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #666;">
                    <i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    No attendees found for this event
                </td>
            </tr>
        `;
    } else {
        attendees.forEach(attendee => {
            const confidencePercent = Math.round((attendee.confidence_score || 0) * 100);
            const confidenceClass = getConfidenceClass(confidencePercent);
            const engagementClass = getEngagementClass(attendee.engagement_type);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="checkbox" class="user-checkbox" value="${escapeHtml(attendee.username)}" 
                           onchange="toggleUserSelection('${escapeHtml(attendee.username)}')">
                </td>
                <td>
                    <strong>${escapeHtml(attendee.username || '@unknown')}</strong>
                    ${attendee.verified ? ' <i class="fas fa-badge-check" style="color: #1d9bf0;"></i>' : ''}
                </td>
                <td><span class="engagement-badge ${engagementClass}">${escapeHtml(attendee.engagement_type || 'mention')}</span></td>
                <td title="${escapeHtml(attendee.post_content || 'No content')}">
                    ${escapeHtml((attendee.post_content || 'No content').length > 60 ? 
                      (attendee.post_content || 'No content').substring(0, 60) + '...' : 
                      (attendee.post_content || 'No content'))}
                </td>
                <td>${escapeHtml(attendee.post_date || 'Unknown date')}</td>
                <td>${(attendee.followers_count || 0).toLocaleString()}</td>
                <td><span class="${confidenceClass}">${confidencePercent}%</span></td>
                <td>
                    <a href="${attendee.post_link || '#'}" target="_blank" class="btn-secondary" 
                       ${!attendee.post_link ? 'onclick="return false;" style="opacity: 0.5;"' : ''}>
                        <i class="fas fa-external-link-alt"></i>
                        View
                    </a>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
    
    // Show results section
    document.getElementById('attendeesResults').classList.remove('hidden');
}

// SELECTION MANAGEMENT
function toggleUserSelection(username) {
    if (selectedUsers.has(username)) {
        selectedUsers.delete(username);
    } else {
        selectedUsers.add(username);
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllAttendees');
    const checkboxes = document.querySelectorAll('.user-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        if (selectAll.checked) {
            selectedUsers.add(checkbox.value);
        } else {
            selectedUsers.delete(checkbox.value);
        }
    });
    
    updateSelectionUI();
}

function updateSelectionUI() {
    const selectedCount = selectedUsers.size;
    const selectionActions = document.getElementById('selectionActions');
    const selectedCountSpan = document.getElementById('selectedCount');
    const selectAllCheckbox = document.getElementById('selectAllAttendees');
    
    selectedCountSpan.textContent = `${selectedCount} users selected`;
    
    if (selectedCount > 0) {
        selectionActions.classList.remove('hidden');
    } else {
        selectionActions.classList.add('hidden');
    }
    
    // Update select all checkbox state
    const totalCheckboxes = document.querySelectorAll('.user-checkbox').length;
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalCheckboxes;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCheckboxes;
}

function sendToNotifications() {
    if (selectedUsers.size === 0) {
        showError('Please select at least one user');
        return;
    }
    
    const selectedAttendees = currentAttendees.filter(attendee => 
        selectedUsers.has(attendee.username)
    );
    
    notificationUsers = selectedAttendees;
    updateNotificationTable();
    switchPhase('phase3');
    
    showSuccess(`Sent ${selectedAttendees.length} users to notifications phase`);
}

// NOTIFICATIONS
function updateNotificationTable() {
    const tableBody = document.getElementById('notificationsTableBody');
    const statsElement = document.getElementById('totalSelected');
    
    statsElement.textContent = `${notificationUsers.length} users selected`;
    
    if (notificationUsers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #666;">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    No users selected yet. Go to Attendees phase and select users to notify.
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = '';
        notificationUsers.forEach(user => {
            const engagementClass = getEngagementClass(user.engagement_type);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${escapeHtml(user.username)}</strong>
                    ${user.verified ? ' <i class="fas fa-badge-check" style="color: #1d9bf0;"></i>' : ''}
                </td>
                <td>${(user.followers_count || 0).toLocaleString()}</td>
                <td><span class="engagement-badge ${engagementClass}">${escapeHtml(user.engagement_type || 'mention')}</span></td>
                <td><span class="status-pending">Pending</span></td>
                <td>
                    <button class="btn-secondary danger" onclick="removeFromNotifications('${escapeHtml(user.username)}')">
                        <i class="fas fa-times"></i>
                        Remove
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }
}

function removeFromNotifications(username) {
    notificationUsers = notificationUsers.filter(user => user.username !== username);
    selectedUsers.delete(username);
    updateNotificationTable();
    showSuccess(`Removed ${username} from notifications`);
}

// TWITTER ACTIONS
async function sendNotifications() {
    const message = document.getElementById('notificationMessage').value.trim();
    
    if (notificationUsers.length === 0) {
        showError('No users selected for actions');
        return;
    }
    
    // Show action selection
    const action = await showActionSelection();
    if (!action) return;
    
    // Validate message for comment/quote actions
    if ((action === 'comment' || action === 'quote') && !message.trim()) {
        showError('Please enter a message for comments or quote tweets');
        return;
    }
    
    showLoading(`Performing ${action} on ${notificationUsers.length} posts...`);
    
    try {
        let endpoint;
        let successKey;
        
        switch(action) {
            case 'retweet':
                endpoint = '/retweet-posts';
                successKey = 'retweeted_count';
                break;
            case 'like':
                endpoint = '/like-posts';
                successKey = 'liked_count';
                break;
            case 'comment':
                endpoint = '/post-comments';
                successKey = 'commented_count';
                break;
            case 'quote':
                endpoint = '/post-quote-tweets';
                successKey = 'quoted_count';
                break;
            default:
                throw new Error('Invalid action');
        }
        
        const requestBody = {
            attendees: notificationUsers
        };
        
        if ((action === 'comment' || action === 'quote') && message) {
            requestBody.message = message;
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Update UI with results
            updateNotificationResults(result, action);
            
            let successMessage = `✅ Successfully ${action}ed ${result[successKey]} posts!`;
            if (result.failed_count > 0) {
                successMessage += ` (${result.failed_count} failed)`;
            }
            
            showSuccess(successMessage);
            
            // Log detailed results for debugging
            console.log(`${action} Results:`, result);
            
        } else {
            throw new Error(result.error || 'Action failed');
        }
        
    } catch (error) {
        console.error('Twitter action error:', error);
        showError('Failed to perform action: ' + error.message);
    } finally {
        hideLoading();
    }
}

function showActionSelection() {
    return new Promise((resolve) => {
        const action = prompt(
            `Choose Twitter action for ${notificationUsers.length} posts:\n\n` +
            `• retweet - Retweet the original posts\n` +
            `• like - Like the original posts\n` +
            `• comment - Comment on the original posts (requires message)\n` +
            `• quote - Create quote tweets (requires message)\n\n` +
            `Enter your choice:`,
            'retweet'
        );
        
        if (action && ['retweet', 'like', 'comment', 'quote'].includes(action.toLowerCase())) {
            resolve(action.toLowerCase());
        } else if (action === null) {
            resolve(null); // User cancelled
        } else {
            showError('Please enter: retweet, like, comment, or quote');
            resolve(showActionSelection()); // Retry
        }
    });
}

function updateNotificationResults(result, action) {
    const tableBody = document.getElementById('notificationsTableBody');
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach((row, index) => {
        if (index < result.results.length) {
            const resultItem = result.results[index];
            const statusCell = row.cells[3];
            
            if (resultItem.status === 'retweeted' || resultItem.status === 'liked' || 
                resultItem.status === 'commented' || resultItem.status === 'quoted') {
                statusCell.innerHTML = `<span class="status-sent">${action}ed</span>`;
            } else {
                statusCell.innerHTML = `<span class="status-pending">Failed: ${escapeHtml(resultItem.error || 'Unknown error')}</span>`;
            }
        }
    });
}

// UTILITY FUNCTIONS
function analyzeAttendees(eventName) {
    document.getElementById('eventSelect').value = eventName;
    document.getElementById('manualEvent').value = '';
    switchPhase('phase2');
    showSuccess(`Ready to analyze attendees for: ${eventName}`);
}

function getConfidenceClass(confidence) {
    if (confidence >= 70) return 'confidence-high';
    if (confidence >= 40) return 'confidence-medium';
    return 'confidence-low';
}

function getEngagementClass(engagementType) {
    switch(engagementType) {
        case 'confirmed_attendance': return 'engagement-confirmed';
        case 'interested': return 'engagement-interested';
        default: return 'engagement-mention';
    }
}

function updateCharacterCount() {
    const message = document.getElementById('notificationMessage').value;
    const charCount = message.length;
    const maxChars = 280;
    
    // You can add character count display if needed
    if (charCount > maxChars) {
        document.getElementById('notificationMessage').style.borderColor = '#dc2626';
    } else {
        document.getElementById('notificationMessage').style.borderColor = '#cbd5e0';
    }
}

function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingModal').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingModal').classList.add('hidden');
}

function showError(message) {
    alert('❌ ' + message);
}

function showSuccess(message) {
    // You can replace this with a toast notification
    console.log('✅ ' + message);
    // For now using alert, but in production use a proper notification system
    if (!message.includes('users selected') && !message.includes('Ready to analyze')) {
        alert('✅ ' + message);
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        discoverEvents,
        discoverAttendees,
        sendNotifications,
        switchPhase
    };
}
