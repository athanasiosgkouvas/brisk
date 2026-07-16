/* Brisk demo site — small vanilla-JS enhancements, no dependencies. */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

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

  // ---- number count-up (fires once when scrolled into view) ----
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function runCountUp(el) {
    var prefix = el.dataset.countPrefix || "";
    var suffix = el.dataset.countSuffix || "";
    var raw = (el.textContent || "").replace(/[^0-9.]/g, "");
    var target = parseFloat(raw);
    if (isNaN(target)) return;
    var decimals =
      el.dataset.countDecimals != null
        ? parseInt(el.dataset.countDecimals, 10)
        : (raw.split(".")[1] || "").length;
    function draw(n) {
      el.textContent =
        prefix +
        n.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) +
        suffix;
    }
    var duration = 1100;
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      draw(target * easeOutCubic(p));
      if (p < 1) requestAnimationFrame(frame);
      else draw(target);
    }
    requestAnimationFrame(frame);
  }

  var countEls = document.querySelectorAll(".countup");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    // leave literal final values in place
  } else {
    var countIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            runCountUp(e.target);
            countIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.6 },
    );
    countEls.forEach(function (el) {
      countIO.observe(el);
    });
  }

  // ---- magnetic buttons (desktop, motion-on only) ----
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".btn").forEach(function (btn) {
      var strength = 0.32;
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) * strength;
        var y = (e.clientY - (r.top + r.height / 2)) * strength;
        btn.style.transform = "translate(" + x + "px," + y + "px)";
      });
      btn.addEventListener("pointerleave", function () {
        btn.style.transition = "transform 0.35s cubic-bezier(0.22,1,0.36,1)";
        btn.style.transform = "";
        setTimeout(function () {
          btn.style.transition = "";
        }, 350);
      });
    });
  }

  // ---- hero tap-to-pay scene: play only while in view ----
  var scene = document.getElementById("tapScene");
  if (scene && !reduceMotion && "IntersectionObserver" in window) {
    var sceneIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          scene.classList.toggle("playing", e.isIntersecting);
        });
      },
      { threshold: 0.3 },
    );
    sceneIO.observe(scene);
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
    if (!timer && !reduceMotion) timer = setInterval(tick, 3800);
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
