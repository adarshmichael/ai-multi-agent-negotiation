/**
 * js/motion.js
 * Central GSAP Motion & Shell Additions
 */

window.Motion = (function () {
  const hasGSAP = typeof gsap !== 'undefined';
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Initialize clock
  function initClock() {
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');
    if (!timeEl || !dateEl) return;

    let clockInterval;
    function updateClock() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
      });
    }

    // Align to exact second
    function alignAndStart() {
      updateClock();
      const delay = 1000 - new Date().getMilliseconds();
      setTimeout(() => {
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
      }, delay);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearInterval(clockInterval);
      } else {
        alignAndStart();
      }
    });

    alignAndStart();
  }

  // Hook GSAP page transitions
  function leaveScreen(el) {
    if (!hasGSAP || prefersReduced || !el) return Promise.resolve();
    gsap.killTweensOf(el);
    return new Promise(resolve => {
      gsap.to(el, {
        opacity: 0,
        y: -10,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
          gsap.set(el, { clearProps: "all" });
          resolve();
        }
      });
    });
  }

  function enterScreen(el) {
    if (!hasGSAP || prefersReduced || !el) return;
    gsap.killTweensOf(el);
    
    // Default animation for the section itself if no children found
    let targets = [];
    
    // Select elements to stagger in based on screen
    if (el.id === 'screen-scenario') targets = el.querySelectorAll('.scenario-card');
    else if (el.id === 'screen-configure') targets = el.querySelectorAll('.agent-config-card, .agent-builder-card, .agent-grid > *');
    else if (el.id === 'screen-summary') targets = el.querySelectorAll('.summary-card, .config-section');
    else if (el.id === 'screen-negotiate') targets = el.querySelectorAll('.ready-panel, .arena-col');
    else if (el.id === 'screen-dashboard') targets = el.querySelectorAll('.quick-start-card, .kpi-tile, .chart-card');
    
    if (!targets || targets.length === 0) {
      // Just animate the whole wrapper
      gsap.fromTo(el,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", clearProps: "transform,opacity" }
      );
      return;
    }

    gsap.fromTo(targets, 
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity" }
    );
  }

  function countUp(el, toVal) {
    if (!hasGSAP || prefersReduced || !el) {
      el.textContent = toVal;
      return;
    }
    const targetObj = { val: 0 };
    gsap.to(targetObj, {
      val: toVal,
      duration: 1.5,
      ease: "power3.out",
      onUpdate: () => {
        el.textContent = Math.floor(targetObj.val);
      },
      onComplete: () => {
        el.textContent = toVal;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initClock();
  });

  return {
    leaveScreen,
    enterScreen,
    countUp
  };
})();
