/* Brisk demo site — small vanilla-JS enhancements, no dependencies. */
(function () {
  "use strict";

  // ---- year stamp ----
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---- scroll reveal ----
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("in");
    });
  }

  // ---- gallery tabs ----
  var tabs = document.querySelectorAll(".g-tab");
  var panels = document.querySelectorAll(".g-panel");
  function show(name) {
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.screen === name);
    });
    panels.forEach(function (p) {
      p.classList.toggle("active", p.dataset.screen === name);
    });
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      stopAuto();
      show(t.dataset.screen);
    });
  });

  // ---- gallery auto-advance (pauses on interaction / when off-screen) ----
  var order = ["wallet", "pay", "save", "link", "gift"];
  var idx = 0;
  var timer = null;
  function tick() {
    idx = (idx + 1) % order.length;
    show(order[idx]);
  }
  function startAuto() {
    if (!timer) timer = setInterval(tick, 3800);
  }
  function stopAuto() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  var stage = document.querySelector(".gallery-stage");
  if (stage && "IntersectionObserver" in window) {
    var stageIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) startAuto();
          else stopAuto();
        });
      },
      { threshold: 0.4 },
    );
    stageIO.observe(stage);
  }
  if (stage) {
    stage.addEventListener("mouseenter", stopAuto);
    stage.addEventListener("mouseleave", startAuto);
  }
})();
