"use strict";

const navigation = document.querySelector("#primary-navigation");
const navigationToggle = document.querySelector(".nav-toggle");
const reservationForm = document.querySelector("#reservation-form");
const visitDate = document.querySelector("#visit-date");
const confirmation = document.querySelector("#confirmation");
const bookingSummary = document.querySelector("#booking-summary");
const copyBookingButton = document.querySelector("#copy-booking");
const copyStatus = document.querySelector("#copy-status");

function localToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

if (visitDate) {
    visitDate.min = localToday();
}

const currentYear = document.querySelector("#current-year");
if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
}

if (navigation && navigationToggle) {
    navigationToggle.addEventListener("click", () => {
        const isOpen = navigationToggle.getAttribute("aria-expanded") === "true";
        navigationToggle.setAttribute("aria-expanded", String(!isOpen));
        navigationToggle.setAttribute("aria-label", isOpen ? "打开导航菜单" : "关闭导航菜单");
        navigation.classList.toggle("is-open", !isOpen);
    });

    navigation.addEventListener("click", (event) => {
        if (event.target instanceof HTMLAnchorElement && navigation.classList.contains("is-open")) {
            navigation.classList.remove("is-open");
            navigationToggle.setAttribute("aria-expanded", "false");
            navigationToggle.setAttribute("aria-label", "打开导航菜单");
        }
    });
}

if (reservationForm && confirmation && bookingSummary && copyBookingButton && copyStatus) {
    reservationForm.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!reservationForm.reportValidity()) {
            return;
        }

        const formData = new FormData(reservationForm);
        const date = String(formData.get("date"));
        const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        });
        const selectedDate = new Date(`${date}T12:00:00`);

        if (Number.isNaN(selectedDate.getTime()) || date < localToday()) {
            visitDate.setCustomValidity("请选择今天或之后的日期。");
            visitDate.reportValidity();
            visitDate.addEventListener("input", () => visitDate.setCustomValidity(""), { once: true });
            return;
        }

        const bookingText = [
            "隐序 · 威士忌与雪茄俱乐部",
            "预约到访咨询（意向待门店确认）",
            "",
            `称呼：${String(formData.get("name")).trim()}`,
            `联系电话：${String(formData.get("phone")).trim()}`,
            `到访日期：${dateFormatter.format(selectedDate)}`,
            `期望时段：${formData.get("time")}`,
            `到访人数：${formData.get("guests")}`,
            `体验意向：${formData.get("interest")}`,
            "",
            "实际预约及到访安排请与门店联系确认。"
        ].join("\n");

        bookingSummary.textContent = bookingText;
        confirmation.hidden = false;
        copyStatus.textContent = "预约信息已整理在此设备，可复制后发送给您的门店联系人；目前不会有信息自动提交至门店。";
        confirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    copyBookingButton.addEventListener("click", async () => {
        const text = bookingSummary.textContent || "";

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const temporaryField = document.createElement("textarea");
                temporaryField.value = text;
                temporaryField.setAttribute("readonly", "");
                temporaryField.style.position = "fixed";
                temporaryField.style.opacity = "0";
                document.body.append(temporaryField);
                temporaryField.select();
                const copied = document.execCommand("copy");
                temporaryField.remove();

                if (!copied) {
                    throw new Error("Clipboard access is unavailable.");
                }
            }

            copyStatus.textContent = "已复制。请粘贴给您的门店联系人，并以门店确认为准。";
        } catch (error) {
            copyStatus.textContent = "自动复制未成功，请手动选中上方的预约信息并复制。";
            console.error("Unable to copy the booking details.", error);
        }
    });
}
