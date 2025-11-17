// contact-form.js - Contact form component

import { getUserAccessLevel, isUserAuthenticated, getUserDisplayName } from './auth.js';

function getUserEmail() {
    try {
        const email = localStorage.getItem('userEmail');
        return email || '';
    } catch {
        return '';
    }
}

function injectContactForm() {
    // Try to find a container element, fallback to body
    let container = document.querySelector('.container') ||
                    document.querySelector('main') ||
                    document.querySelector('.content') ||
                    document.body;

    if (!container) return;

    // Check if form already exists to avoid duplicates
    if (document.getElementById('compactFeedbackForm')) return;

    const contactSection = document.createElement('div');
    contactSection.className = 'compact-contact-section';
    contactSection.innerHTML = `
        <div class="compact-contact-form">
            <h4>💬 Have a feature suggestion or found an issue?</h4>
            <form id="compactFeedbackForm">
                <div class="compact-form-row">
                    <select id="compactFeedbackType" name="feedbackType" required>
                        <option value="">Select feedback type...</option>
                        <option value="bug">🐛 Bug Report</option>
                        <option value="feature">✨ Feature Request</option>
                        <option value="improvement">🔧 Improvement</option>
                        <option value="other">💭 Other</option>
                    </select>
                    <input type="email" id="compactEmail" name="email" placeholder="📧 Email (optional)">
                </div>
                <textarea id="compactMessage" name="message" placeholder="💬 Your feedback..." required></textarea>
                <div class="compact-form-footer">
                    <button type="submit" class="compact-submit-btn">Send Feedback</button>
                    <div class="compact-status" id="compactStatus" style="display: none;"></div>
                </div>
            </form>
        </div>
    `;

    container.appendChild(contactSection);
}

function setupContactForm() {
    setTimeout(() => {
        const form = document.getElementById('compactFeedbackForm');
        const submitBtn = form?.querySelector('.compact-submit-btn');
        const statusDiv = document.getElementById('compactStatus');

        if (!form) return;

        // Autofill email if user is authenticated and not a guest (access level > 1)
        const isAuthenticated = isUserAuthenticated();
        const userAccessLevel = getUserAccessLevel();
        const emailField = document.getElementById('compactEmail');

        if (isAuthenticated && userAccessLevel > 1 && emailField) {
            const userEmail = getUserEmail();
            if (userEmail) {
                emailField.value = userEmail;
                emailField.readOnly = true;
                emailField.style.backgroundColor = '#f0f0f0';
                emailField.style.cursor = 'not-allowed';
            }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const feedbackData = {
                feedbackType: formData.get('feedbackType'),
                email: formData.get('email') || 'Not provided',
                message: formData.get('message'),
                timestamp: new Date().toISOString(),
                page: document.title || 'Unknown page',
                url: window.location.href,
                userAccessLevel: getUserAccessLevel()
            };

            if (!feedbackData.feedbackType || !feedbackData.message.trim()) {
                showCompactStatus('Please fill in required fields.', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            statusDiv.style.display = 'none';

            try {
                const success = await sendCompactFeedback(feedbackData);
                if (success) {
                    showCompactStatus('✅ Feedback sent successfully!', 'success');
                    form.reset();
                } else {
                    showCompactStatus('❌ Failed to send. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Form submission error:', error);
                showCompactStatus('⚠️ An error occurred. Please try again.', 'error');
            }

            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Feedback';
        });
    }, 100);
}

async function sendCompactFeedback(data) {
    try {
        const token = localStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json'
        };

        // Only add Authorization header if token exists
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await API_CONFIG.fetch('sendform', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error('Feedback submission error:', error);
        return false;
    }
}

function showCompactStatus(message, type) {
    const statusDiv = document.getElementById('compactStatus');
    if (!statusDiv) return;
    
    statusDiv.textContent = message;
    statusDiv.className = `compact-status ${type}`;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 4000);
    }
}

export { injectContactForm, setupContactForm };
