
    let isLogin = typeof window.__initialFormIsLogin !== 'undefined' ? window.__initialFormIsLogin : false;

    function toggleForm() {
      const title = document.getElementById("form-title");
      const subtitle = document.getElementById("form-subtitle");
      const registerForm = document.getElementById("register-form");
      const loginForm = document.getElementById("login-form");
      const toggleText = document.getElementById("toggle-text");
      const toggleLink = document.getElementById("toggle-link");

      if (!isLogin) {
        title.innerText = "Login to your account";
        subtitle.innerText = "Welcome back. Enter your credentials to continue.";
        registerForm.classList.remove("active");
        loginForm.classList.add("active");
        toggleText.innerText = "Don’t have an account?";
        toggleLink.innerText = "Sign up";
      } else {
        title.innerText = "Create an account";
        subtitle.innerText = "Let’s get started with your 30-day free trial.";
        loginForm.classList.remove("active");
        registerForm.classList.add("active");
        toggleText.innerText = "Already have an account?";
        toggleLink.innerText = "Login";
      }

      isLogin = !isLogin;
    }