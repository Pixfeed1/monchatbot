document.addEventListener('DOMContentLoaded', function() {
    const smsProvider = document.getElementById("sms_provider");
    const twilioSettings = document.getElementById("twilio_settings");
    const vonageSettings = document.getElementById("vonage_settings");

    smsProvider.addEventListener("change", function() {
        const provider = this.value;
        twilioSettings.style.display = (provider === "twilio") ? "block" : "none";
        vonageSettings.style.display = (provider === "vonage") ? "block" : "none";
    });
});