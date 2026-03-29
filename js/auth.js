import { auth, googleProvider } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  updateProfile,
  onAuthStateChanged,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Initialize Icons if present
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}

// Removed Slideshow logic as requested

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerSection = document.getElementById('register-section');
const loginSection = document.getElementById('login-section');
const registerForm = document.getElementById('register-form');
const verificationSection = document.getElementById('verification-section');

const linkToRegister = document.getElementById('link-to-register');
const linkToLogin = document.getElementById('link-to-login');

const btnGoogle = document.getElementById('btn-google');

const loginError = document.getElementById('login-error');
const regError = document.getElementById('reg-error');

// Verification Elements
const verificationEmail = document.getElementById('verification-email');
const verificationStatus = document.querySelector('.verification-status');
const btnResendEmail = document.getElementById('btn-resend-email');
const btnRefreshStatus = document.getElementById('btn-refresh-status');
const btnLogout = document.getElementById('btn-logout');

// Toggle UI
linkToRegister.addEventListener('click', (e) => {
  e.preventDefault();
  loginSection.classList.add('hidden');
  registerSection.classList.remove('hidden');
});

linkToLogin.addEventListener('click', (e) => {
  e.preventDefault();
  registerSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
});

// Auth State Observer - Check verification and redirect if authenticated
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Reload to get the latest email verification status
    await user.reload();
    
    if (user.emailVerified) {
      // Email is verified, save to local storage and redirect
      localStorage.setItem('akarabook_user', JSON.stringify({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL
      }));
      window.location.href = 'app.html';
    } else {
      // Email not verified, show verification screen
      showVerificationScreen(user);
    }
  } else {
    localStorage.removeItem('akarabook_user');
  }
});

// Helpers
const showError = (el, msg) => {
  el.textContent = msg;
  el.classList.remove('hidden');
};
const hideError = (el) => {
  el.classList.add('hidden');
  el.textContent = '';
};

// Show verification screen
const showVerificationScreen = (user) => {
  loginSection.classList.add('hidden');
  registerSection.classList.add('hidden');
  verificationSection.classList.remove('hidden');
  verificationEmail.textContent = user.email;
};

// Hide verification screen
const hideVerificationScreen = () => {
  verificationSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
};

const getErrorMessage = (code) => {
  switch(code) {
    case 'auth/email-already-in-use': return 'This email is already registered. Please log in.';
    case 'auth/invalid-credential': return 'Invalid email or password.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/user-not-found': return 'No account found with this email.';
    case 'auth/wrong-password': return 'Incorrect password. Try again.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/weak-password': return 'Password must be at least 6 characters with uppercase, lowercase, and a number.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    default: return 'Something went wrong. Please try again.';
  }
};

function validatePassword(password) {
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  return null;
}

// Login Action
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError(loginError);
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');
  
  try {
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showError(loginError, getErrorMessage(error.code));
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
});

// Register Action
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError(regError);
  
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const btn = document.getElementById('btn-register');
  
  try {
    btn.textContent = 'Creating account...';
    btn.disabled = true;

    const validationError = validatePassword(password);
    if (validationError) {
      showError(regError, validationError);
      btn.textContent = 'Create Account';
      btn.disabled = false;
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update profile with display name
    await updateProfile(userCredential.user, {
      displayName: name
    });
    
    // Send email verification
    await sendEmailVerification(userCredential.user);
    
    // Reload user to ensure displayName gets updated immediately in local session
    await auth.currentUser.reload();
    
    // Show verification screen (the observer will also trigger this)
    showVerificationScreen(userCredential.user);
    
  } catch (error) {
    showError(regError, getErrorMessage(error.code));
    btn.textContent = 'Create Account';
    btn.disabled = false;
  }
});

// Verification Screen Event Listeners
btnResendEmail.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (user && !user.emailVerified) {
    try {
      btnResendEmail.disabled = true;
      btnResendEmail.textContent = 'Sending...';
      await sendEmailVerification(user);
      verificationStatus.textContent = '✓ Verification email sent!';
      setTimeout(() => {
        verificationStatus.textContent = 'Waiting for verification...';
      }, 3000);
    } catch (error) {
      verificationStatus.textContent = '✗ Failed to resend email. Try again.';
    } finally {
      btnResendEmail.disabled = false;
      btnResendEmail.textContent = 'Resend Email';
    }
  }
});

btnRefreshStatus.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (user) {
    try {
      btnRefreshStatus.disabled = true;
      btnRefreshStatus.textContent = 'Checking...';
      await user.reload();
      
      if (user.emailVerified) {
        verificationStatus.textContent = '✓ Email verified! Redirecting...';
        setTimeout(() => {
          localStorage.setItem('akarabook_user', JSON.stringify({
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL
          }));
          window.location.href = 'app.html';
        }, 1500);
      } else {
        verificationStatus.textContent = 'Waiting for verification...';
      }
    } catch (error) {
      verificationStatus.textContent = '✗ Error checking status. Try again.';
    } finally {
      btnRefreshStatus.disabled = false;
      btnRefreshStatus.textContent = 'Refresh Status';
    }
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await signOut(auth);
    hideVerificationScreen();
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

// Google Sign In
btnGoogle.addEventListener('click', async () => {
  hideError(loginError);
  hideError(regError);
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Google Auth Error:", error);
    if (error.code === 'auth/unauthorized-domain') {
      showError(loginError, "Error: Unauthorized domain. Please run via Localhost Server (not file://).");
    } else {
      showError(loginError, `Google Sign-In failed: ${error.message}`);
    }
  }
});

// --- Modals for Privacy and Terms on Auth Page ---
const linkTerms = document.getElementById('link-terms-auth');
const linkPrivacy = document.getElementById('link-privacy-auth');
const modalTerms = document.getElementById('modal-terms');
const modalPrivacy = document.getElementById('modal-privacy');

if (linkTerms && modalTerms) {
  linkTerms.addEventListener('click', (e) => {
    e.preventDefault();
    modalTerms.classList.remove('hidden');
  });
  document.getElementById('close-terms')?.addEventListener('click', () => modalTerms.classList.add('hidden'));
}

if (linkPrivacy && modalPrivacy) {
  linkPrivacy.addEventListener('click', (e) => {
    e.preventDefault();
    modalPrivacy.classList.remove('hidden');
  });
  document.getElementById('close-privacy')?.addEventListener('click', () => modalPrivacy.classList.add('hidden'));
}
