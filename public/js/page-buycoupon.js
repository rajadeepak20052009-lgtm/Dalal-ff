/* ---------------------------------------------------------
   Buy coupon: package -> UPI -> UTR -> code
   --------------------------------------------------------- */
(async () => {
  const { $, $$, api, note, busy, nfmt, esc } = FFL;
  const cfg = await FFL.applyConfig();
  $("year").textContent = new Date().getFullYear();

  let selected = null;
  let order = null;
  let poll = null;

  /* ---------- step 1: packages ---------- */
  $("pkgGrid").innerHTML = (cfg.packages || [])
    .map(
      (p) => `<div class="pkg" data-likes="${p.likes}" role="button" tabindex="0">
        <div class="likes">${esc(p.label || nfmt(p.likes))}</div>
        <div class="price">₹${nfmt(p.price)}</div>
        <div class="per">${nfmt(p.likes)} likes</div>
      </div>`
    )
    .join("");

  function selectPkg(el) {
    $$(".pkg").forEach((x) => x.classList.toggle("selected", x === el));
    selected = Number(el.dataset.likes);
    note($("step1Result"), "info", "");
  }
  $$(".pkg").forEach((el) => {
    el.addEventListener("click", () => selectPkg(el));
    el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && selectPkg(el));
  });

  function goStep(n) {
    [1, 2, 3].forEach((i) => {
      $("step" + i).hidden = i !== n;
      $$(`.step[data-step="${i}"]`).forEach((s) => s.classList.toggle("active", i <= n));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("createBtn").addEventListener("click", async () => {
    if (!selected) return note($("step1Result"), "err", "Pehle ek package select kijiye.");
    busy($("createBtn"), true, "Creating order…");
    const r = await api("/api/order/create", {
      method: "POST",
      body: { likes: selected, name: $("buyerName").value.trim(), contact: $("buyerContact").value.trim() },
    });
    busy($("createBtn"), false);
    if (!r.ok) return note($("step1Result"), "err", esc(r.message || "Could not create the order"));

    order = r.order;
    $("payAmount").textContent = "₹" + nfmt(order.price);
    $("orderIdText").textContent = order.id;
    $("upiId").textContent = (cfg.payment && cfg.payment.upiId) || "-";
    $("upiPay").href = r.upi;
    goStep(2);
  });

  $("copyUpi").addEventListener("click", async () => {
    await FFL.copy($("upiId").textContent.trim());
    note($("step2Result"), "ok", "UPI id copied.");
  });

  /* ---------- step 2: UTR ---------- */
  $("utrBtn").addEventListener("click", async () => {
    const utr = $("utr").value.trim();
    if (utr.length < 6) return note($("step2Result"), "err", "Poora UTR / transaction id daaliye.");
    busy($("utrBtn"), true, "Submitting…");
    const r = await api("/api/order/utr", { method: "POST", body: { id: order.id, utr } });
    busy($("utrBtn"), false);
    if (!r.ok) return note($("step2Result"), "err", esc(r.message || "Failed"));
    goStep(3);
    startPolling();
  });

  /* ---------- step 3: wait for the code ---------- */
  function startPolling() {
    clearInterval(poll);
    let dots = 0;
    poll = setInterval(async () => {
      dots = (dots + 1) % 4;
      $("waitDots").textContent = "• ".repeat(dots + 1).trim();
      const r = await api(`/api/order/status?id=${encodeURIComponent(order.id)}`);
      if (!r.ok) return;
      const st = r.order.status;
      if (st === "approved" && r.order.coupon) {
        clearInterval(poll);
        $("waitDots").textContent = "🎉";
        $("waitText").textContent = "Payment verified!";
        note(
          $("step3Result"),
          "ok",
          `<b>Your redeem code</b><div class="copy-box" style="margin-top:8px"><span id="finalCode">${esc(r.order.coupon)}</span></div>
           <div style="height:10px"></div><a class="btn" href="/?code=${encodeURIComponent(r.order.coupon)}"><i class="fas fa-bolt"></i> Send likes now</a>`
        );
      } else if (st === "rejected") {
        clearInterval(poll);
        $("waitDots").textContent = "❌";
        $("waitText").textContent = "Payment could not be verified.";
        note($("step3Result"), "err", "Owner ne payment verify nahi kiya. WhatsApp par sampark kijiye.");
      } else if (st === "expired") {
        clearInterval(poll);
        $("waitDots").textContent = "⏰";
        $("waitText").textContent = "Code window expired.";
        note($("step3Result"), "warn", "Time window khatam. Owner se WhatsApp par code maangiye.");
      }
    }, 4000);
  }
})();
