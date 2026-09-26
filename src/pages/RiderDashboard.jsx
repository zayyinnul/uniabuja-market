import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import OrderChat from "../OrderChat";

const WORKER_BASE_URL = import.meta.env.DEV
  ? "http://127.0.0.1:8787"
  : "";

export default function RiderDashboard({ user, onBack }) {
  const [loading, setLoading] = useState(true);

  const [isRider, setIsRider] = useState(false);
  const [application, setApplication] = useState(null);

  const [profileName, setProfileName] = useState("");
  const [phone, setPhone] = useState("");

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [studentIdNumber, setStudentIdNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [passportPhoto, setPassportPhoto] = useState(null);
  const [studentIdDocument, setStudentIdDocument] = useState(null);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [hasVehicle, setHasVehicle] = useState("");

  const [submittingApplication, setSubmittingApplication] =
    useState(false);

  const [zones, setZones] = useState([]);
  const [fees, setFees] = useState({});
  const [existingRates, setExistingRates] = useState({});
  const [savingZone, setSavingZone] = useState(null);

  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [availableDeliveriesLoading, setAvailableDeliveriesLoading] =
    useState(false);
  const [claimingDelivery, setClaimingDelivery] = useState(null);

  // Payout account
  const [payoutAccount, setPayoutAccount] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [verifyingPayout, setVerifyingPayout] = useState(false);

  const [payoutBanks, setPayoutBanks] = useState([]);
  const [selectedPayoutBank, setSelectedPayoutBank] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutBankName, setPayoutBankName] = useState("");
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [payoutEditing, setPayoutEditing] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
      setMessage("Please log in first.");
    }
  }, [user]);

  // Keep available deliveries reasonably fresh while the rider dashboard
  // is open. This does not assign anything automatically; it simply refreshes
  // the list of deliveries that this rider is eligible to claim.
  useEffect(() => {
    if (!user || !isRider) {
      return;
    }

    const interval = setInterval(() => {
      loadAvailableDeliveries();
      loadAssignedDeliveries();
    }, 15000);

    return () => clearInterval(interval);
  }, [user, isRider]);

  async function getWorkerHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      Authorization: `Bearer ${session?.access_token || ""}`,
      "Content-Type": "application/json",
    };
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    const { data: profileData, error: profileError } =
      await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      console.error("Profile error:", profileError);
      setMessage(profileError.message);
      setLoading(false);
      return;
    }

    const officialName = profileData?.full_name || "";

    setProfileName(officialName);

    const { data: riderDataResult, error: riderError } =
      await supabase
        .from("delivery_riders")
        .select("id, is_active, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();

    if (riderError) {
      console.error("Rider check error:", riderError);
      setMessage(riderError.message);
      setLoading(false);
      return;
    }

    const activeRider = !!riderDataResult?.is_active;

    setIsRider(activeRider);

    if (!activeRider) {
      const { data: applicationData, error: applicationError } =
        await supabase
          .from("rider_applications")
          .select(
            `
              id,
              user_id,
              full_name,
              phone,
              date_of_birth,
              address,
              student_id_number,
              department,
              level,
              passport_photo_path,
              student_id_document_path,
              emergency_contact_name,
              emergency_contact_phone,
              has_vehicle,
              status,
              admin_note,
              created_at,
              updated_at
            `
          )
          .eq("user_id", user.id)
          .maybeSingle();

      if (applicationError) {
        console.error("Application error:", applicationError);
        setMessage(applicationError.message);
        setLoading(false);
        return;
      }

      setApplication(applicationData || null);

      if (applicationData) {
        setPhone(applicationData.phone || "");
        setDateOfBirth(applicationData.date_of_birth || "");
        setAddress(applicationData.address || "");
        setStudentIdNumber(applicationData.student_id_number || "");
        setDepartment(applicationData.department || "");
        setLevel(applicationData.level || "");

        setEmergencyContactName(
          applicationData.emergency_contact_name || ""
        );

        setEmergencyContactPhone(
          applicationData.emergency_contact_phone || ""
        );

        if (applicationData.has_vehicle === true) {
          setHasVehicle("yes");
        } else if (applicationData.has_vehicle === false) {
          setHasVehicle("no");
        }
      } else {
        setPhone(profileData?.phone || "");
      }

      setLoading(false);
      return;
    }

    const { data: zonesData, error: zonesError } =
      await supabase
        .from("delivery_zones")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

    if (zonesError) {
      console.error("Zones error:", zonesError);
      setMessage(zonesError.message);
      setLoading(false);
      return;
    }

    const { data: ratesData, error: ratesError } =
      await supabase
        .from("rider_delivery_rates")
        .select(
          "zone_id, proposed_fee, approved_fee, approval_status, is_active"
        )
        .eq("rider_id", user.id);

    if (ratesError) {
      console.error("Rates error:", ratesError);
      setMessage(ratesError.message);
      setLoading(false);
      return;
    }

    const feeMap = {};
    const rateMap = {};

    (ratesData || []).forEach((rate) => {
      feeMap[rate.zone_id] = rate.proposed_fee;
      rateMap[rate.zone_id] = rate;
    });

    setZones(zonesData || []);
    setFees(feeMap);
    setExistingRates(rateMap);

    await loadPayoutAccount();
    await loadPayoutBanks();
    await loadAssignedDeliveries();
    await loadAvailableDeliveries();

    setLoading(false);
  }

  async function loadPayoutBanks() {
    setLoadingBanks(true);

    try {
      const headers = await getWorkerHeaders();

      const response = await fetch(
        `${WORKER_BASE_URL}/api/payouts/banks`,
        {
          method: "GET",
          headers,
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.status) {
        throw new Error(
          data?.message || "Unable to load banks."
        );
      }

      setPayoutBanks(data.data || []);
    } catch (error) {
      console.error("Load payout banks error:", error);

      setMessage(
        error?.message ||
          "Unable to load the bank list. Please try again."
      );
    } finally {
      setLoadingBanks(false);
    }
  }

  async function loadPayoutAccount() {
    setPayoutLoading(true);

    const { data, error } = await supabase
      .from("rider_payout_accounts")
      .select(
        `
          id,
          rider_id,
          account_name,
          bank_code,
          bank_name,
          account_number,
          paystack_recipient_code,
          is_verified,
          is_active,
          created_at,
          updated_at
        `
      )
      .eq("rider_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Payout account error:", error);

      setPayoutAccount(null);
      setPayoutLoading(false);
      return;
    }

    setPayoutAccount(data || null);

    if (data) {
      setPayoutAccountName(data.account_name || "");
      setPayoutBankName(data.bank_name || "");
      setPayoutBankCode(data.bank_code || "");
      setPayoutAccountNumber(data.account_number || "");
      setSelectedPayoutBank(data.bank_code || "");
    }

    setPayoutLoading(false);
  }

  function handlePayoutBankChange(bankCode) {
    setSelectedPayoutBank(bankCode);

    const selectedBank = payoutBanks.find(
      (bank) => String(bank.code) === String(bankCode)
    );

    setPayoutBankCode(selectedBank?.code || "");
    setPayoutBankName(selectedBank?.name || "");

    setPayoutAccountName("");
  }

  async function verifyPayoutAccount() {
    const accountNumber = payoutAccountNumber.replace(
      /\s/g,
      ""
    );

    if (!selectedPayoutBank) {
      setMessage("Please select your bank.");
      return;
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      setMessage("Please enter a valid 10-digit account number.");
      return;
    }

    const selectedBank = payoutBanks.find(
      (bank) =>
        String(bank.code) === String(selectedPayoutBank)
    );

    if (!selectedBank) {
      setMessage("Please select a valid bank.");
      return;
    }

    setVerifyingPayout(true);
    setMessage("");

    try {
      const headers = await getWorkerHeaders();

      const response = await fetch(
        `${WORKER_BASE_URL}/api/payouts/resolve-account`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            account_number: accountNumber,
            bank_code: selectedBank.code,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message ||
            "Unable to verify this bank account."
        );
      }

      setPayoutAccountName(data.account_name || "");
      setPayoutBankName(selectedBank.name);
      setPayoutBankCode(selectedBank.code);
      setSelectedPayoutBank(selectedBank.code);
      setPayoutAccountNumber(
        data.account_number || accountNumber
      );

      setMessage(
        `Account verified: ${data.account_name || "Account holder"}`
      );
    } catch (error) {
      console.error("Verify payout account error:", error);

      setPayoutAccountName("");

      setMessage(
        error?.message ||
          "Unable to verify this account. Please check the details and try again."
      );
    } finally {
      setVerifyingPayout(false);
    }
  }

  async function savePayoutAccount(e) {
    e.preventDefault();

    const accountName = payoutAccountName.trim();
    const accountNumber = payoutAccountNumber.replace(
      /\s/g,
      ""
    );

    const selectedBank = payoutBanks.find(
      (bank) =>
        String(bank.code) === String(selectedPayoutBank)
    );

    if (!selectedBank) {
      setMessage("Please select your bank.");
      return;
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      setMessage("Please enter a valid 10-digit account number.");
      return;
    }

    if (!accountName) {
      setMessage(
        "Please verify your account before saving it."
      );
      return;
    }

    setSavingPayout(true);
    setMessage("");

    try {
      if (payoutAccount) {
        const { data, error } = await supabase
          .from("rider_payout_accounts")
          .update({
            account_name: accountName,
            bank_name: selectedBank.name,
            bank_code: selectedBank.code,
            account_number: accountNumber,
            paystack_recipient_code: null,
            is_verified: true,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payoutAccount.id)
          .eq("rider_id", user.id)
          .select()
          .single();

        if (error) {
          console.error(
            "Update payout account error:",
            error
          );

          setMessage(error.message);
          setSavingPayout(false);
          return;
        }

        setPayoutAccount(data);

        setMessage(
          "Your payout account has been updated successfully."
        );
      } else {
        const { data, error } = await supabase
          .from("rider_payout_accounts")
          .insert({
            rider_id: user.id,
            account_name: accountName,
            bank_name: selectedBank.name,
            bank_code: selectedBank.code,
            account_number: accountNumber,
            paystack_recipient_code: null,
            is_verified: true,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          console.error(
            "Create payout account error:",
            error
          );

          setMessage(error.message);
          setSavingPayout(false);
          return;
        }

        setPayoutAccount(data);

        setMessage(
          "Your payout account has been saved successfully."
        );
      }

      setPayoutEditing(false);

      await loadPayoutAccount();
    } catch (error) {
      console.error("Payout account error:", error);

      setMessage(
        error?.message ||
          "Unable to save your payout account."
      );
    }

    setSavingPayout(false);
  }

  function startEditingPayout() {
    if (!payoutAccount) {
      return;
    }

    setSelectedPayoutBank(payoutAccount.bank_code || "");
    setPayoutAccountName(payoutAccount.account_name || "");
    setPayoutBankName(payoutAccount.bank_name || "");
    setPayoutBankCode(payoutAccount.bank_code || "");
    setPayoutAccountNumber(
      payoutAccount.account_number || ""
    );
    setPayoutEditing(true);
    setMessage("");
  }

  async function loadAssignedDeliveries() {
    setDeliveriesLoading(true);

    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        id,
        vendor_order_id,
        delivery_method,
        delivery_fee,
        status,
        pickup_code,
        delivery_code,
        picked_up_at,
        delivered_at,
        created_at,
        updated_at
      `)
      .eq("rider_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Assigned deliveries error:", error);
      setMessage(error.message);
      setDeliveriesLoading(false);
      return;
    }

    setDeliveries(data || []);
    setDeliveriesLoading(false);
  }

  async function loadAvailableDeliveries() {
    setAvailableDeliveriesLoading(true);

    const { data, error } = await supabase.rpc(
      "get_available_rider_deliveries"
    );

    if (error) {
      console.error(
        "Available deliveries error:",
        error
      );

      setAvailableDeliveries([]);
      setAvailableDeliveriesLoading(false);
      return;
    }

    setAvailableDeliveries(data || []);
    setAvailableDeliveriesLoading(false);
  }

  async function claimDelivery(deliveryId) {
    if (!deliveryId || claimingDelivery) {
      return;
    }

    setClaimingDelivery(deliveryId);
    setMessage("");

    const { error } = await supabase.rpc(
      "claim_delivery",
      {
        p_delivery_id: deliveryId,
      }
    );

    if (error) {
      console.error("Claim delivery error:", error);

      setMessage(
        error?.message ||
          "This delivery could not be claimed. It may already have been taken."
      );

      setClaimingDelivery(null);

      await loadAvailableDeliveries();
      await loadAssignedDeliveries();

      return;
    }

    setMessage("Delivery claimed successfully.");

    setClaimingDelivery(null);

    await loadAvailableDeliveries();
    await loadAssignedDeliveries();
  }

  function validateApplicationFile(file, label) {
    if (!file) {
      return `${label} is required.`;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      return `${label} must be JPG, PNG, WEBP, or PDF.`;
    }

    if (file.size > 5 * 1024 * 1024) {
      return `${label} must be 5MB or smaller.`;
    }

    return null;
  }

  async function uploadVerificationFile(file, type) {
    const extension =
      file.name.split(".").pop()?.toLowerCase() || "file";

    const path = `${user.id}/${type}-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("rider-verification")
      .upload(path, file, {
        upsert: false,
      });

    if (error) {
      throw error;
    }

    return path;
  }

  async function submitApplication(e) {
    e.preventDefault();

    if (!profileName.trim()) {
      setMessage(
        "Please add your full name to your profile before applying as a rider."
      );
      return;
    }

    if (!phone.trim()) {
      setMessage("Please enter your phone number.");
      return;
    }

    if (!dateOfBirth) {
      setMessage("Please enter your date of birth.");
      return;
    }

    if (!address.trim()) {
      setMessage("Please enter your address.");
      return;
    }

    if (!studentIdNumber.trim()) {
      setMessage("Please enter your student ID number.");
      return;
    }

    if (!department.trim()) {
      setMessage("Please enter your department.");
      return;
    }

    if (!level.trim()) {
      setMessage("Please enter your level.");
      return;
    }

    if (!emergencyContactName.trim()) {
      setMessage("Please enter an emergency contact name.");
      return;
    }

    if (!emergencyContactPhone.trim()) {
      setMessage(
        "Please enter an emergency contact phone number."
      );
      return;
    }

    if (hasVehicle !== "yes" && hasVehicle !== "no") {
      setMessage(
        "Please indicate whether you have access to a vehicle, motorcycle, or bicycle."
      );
      return;
    }

    const passportError = validateApplicationFile(
      passportPhoto,
      "Passport photo"
    );

    if (passportError) {
      setMessage(passportError);
      return;
    }

    const idDocumentError = validateApplicationFile(
      studentIdDocument,
      "Student ID document"
    );

    if (idDocumentError) {
      setMessage(idDocumentError);
      return;
    }

    setSubmittingApplication(true);
    setMessage("");

    let passportPath = null;
    let studentIdPath = null;

    try {
      passportPath = await uploadVerificationFile(
        passportPhoto,
        "passport"
      );

      studentIdPath = await uploadVerificationFile(
        studentIdDocument,
        "student-id"
      );

      const { data, error } = await supabase
        .from("rider_applications")
        .insert({
          user_id: user.id,
          full_name: profileName.trim(),
          phone: phone.trim(),
          date_of_birth: dateOfBirth,
          address: address.trim(),
          student_id_number: studentIdNumber.trim(),
          department: department.trim(),
          level: level.trim(),
          passport_photo_path: passportPath,
          student_id_document_path: studentIdPath,
          emergency_contact_name: emergencyContactName.trim(),
          emergency_contact_phone:
            emergencyContactPhone.trim(),
          has_vehicle: hasVehicle === "yes",
        })
        .select(
          `
            id,
            user_id,
            full_name,
            phone,
            date_of_birth,
            address,
            student_id_number,
            department,
            level,
            passport_photo_path,
            student_id_document_path,
            emergency_contact_name,
            emergency_contact_phone,
            has_vehicle,
            status,
            admin_note,
            created_at,
            updated_at
          `
        )
        .single();

      if (error) {
        console.error(
          "Submit rider application error:",
          error
        );

        if (error.code === "23505") {
          setMessage(
            "You already have a rider application. Please check its status below."
          );
        } else {
          setMessage(error.message);
        }

        setSubmittingApplication(false);
        return;
      }

      setApplication(data);

      setPassportPhoto(null);
      setStudentIdDocument(null);

      setMessage(
        "Your rider application has been submitted successfully."
      );
    } catch (error) {
      console.error(
        "Rider verification upload error:",
        error
      );

      setMessage(
        error?.message ||
          "Unable to upload your verification documents."
      );
    }

    setSubmittingApplication(false);
  }

  function handleFeeChange(zoneId, value) {
    setFees((current) => ({
      ...current,
      [zoneId]: value,
    }));
  }

  async function saveFee(zoneId) {
    const value = fees[zoneId];

    if (value === undefined || value === "") {
      setMessage("Enter a delivery fee first.");
      return;
    }

    const fee = Number(value);

    if (!Number.isFinite(fee) || fee < 0) {
      setMessage("Enter a valid delivery fee.");
      return;
    }

    setSavingZone(zoneId);
    setMessage("");

    const { error } = await supabase.rpc(
      "set_rider_delivery_rate",
      {
        p_zone_id: zoneId,
        p_proposed_fee: fee,
      }
    );

    if (error) {
      console.error("Save rider rate error:", error);
      setMessage(error.message);
      setSavingZone(null);
      return;
    }

    setMessage(
      "Fee submitted. It will become active after admin approval."
    );

    await loadData();
    setSavingZone(null);
  }

  function formatDeliveryStatus(status) {
    if (!status) {
      return "Unknown";
    }

    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatNaira(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return "₦0";
    }

    if (amount === 0) {
      return "🎉 Free delivery";
    }

    return `₦${amount.toLocaleString()}`;
  }

  function maskAccountNumber(accountNumber) {
    if (!accountNumber) {
      return "";
    }

    const value = String(accountNumber);

    if (value.length <= 4) {
      return value;
    }

    return `••••••${value.slice(-4)}`;
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-container">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            ← Back to Home
          </button>

          <div className="dashboard-header">
            <p className="welcome-small">
              DELIVERY PARTNERS
            </p>

            <h1>Rider Dashboard</h1>

            <p>Checking your rider status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-container">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            ← Back to Home
          </button>

          <div className="dashboard-header">
            <p className="welcome-small">
              DELIVERY PARTNERS
            </p>

            <h1>Become a Rider</h1>

            <p>
              Please log in to apply as a delivery rider.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isRider) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-container">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            ← Back to Home
          </button>

          <div className="dashboard-header">
            <p className="welcome-small">
              DELIVERY PARTNERS
            </p>

            <h1>Become a Rider</h1>

            <p>
              Join the UniAbuja Market delivery network and earn
              by delivering orders to students.
            </p>
          </div>

          {message && (
            <div className="dashboard-card">
              <p>{message}</p>
            </div>
          )}

          {!application && (
            <form
              className="dashboard-card"
              onSubmit={submitApplication}
            >
              <h3>Apply as a Delivery Rider</h3>

              <p>
                Please provide your details and verification
                documents. An admin will review your application
                before you can deliver orders.
              </p>

              <div style={{ marginTop: "18px" }}>
                <label
                  htmlFor="rider-full-name"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Full name
                </label>

                <input
                  id="rider-full-name"
                  type="text"
                  value={profileName}
                  onChange={(e) =>
                    setProfileName(e.target.value)
                  }
                  placeholder="Enter your full name"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-phone"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Phone number
                </label>

                <input
                  id="rider-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-dob"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Date of birth
                </label>

                <input
                  id="rider-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) =>
                    setDateOfBirth(e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-address"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Address
                </label>

                <textarea
                  id="rider-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter your current address"
                  rows="3"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-student-id"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Student ID number
                </label>

                <input
                  id="rider-student-id"
                  type="text"
                  value={studentIdNumber}
                  onChange={(e) =>
                    setStudentIdNumber(e.target.value)
                  }
                  placeholder="Enter your student ID number"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-department"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Department
                </label>

                <input
                  id="rider-department"
                  type="text"
                  value={department}
                  onChange={(e) =>
                    setDepartment(e.target.value)
                  }
                  placeholder="e.g. Business Administration"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-level"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Level
                </label>

                <select
                  id="rider-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                >
                  <option value="">Select level</option>
                  <option value="100">100 Level</option>
                  <option value="200">200 Level</option>
                  <option value="300">300 Level</option>
                  <option value="400">400 Level</option>
                  <option value="500">500 Level</option>
                  <option value="Postgraduate">
                    Postgraduate
                  </option>
                </select>
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-emergency-name"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Emergency contact name
                </label>

                <input
                  id="rider-emergency-name"
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) =>
                    setEmergencyContactName(e.target.value)
                  }
                  placeholder="Enter emergency contact name"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-emergency-phone"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Emergency contact phone
                </label>

                <input
                  id="rider-emergency-phone"
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={(e) =>
                    setEmergencyContactPhone(e.target.value)
                  }
                  placeholder="Enter emergency contact phone"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Do you have access to a vehicle, motorcycle,
                  or bicycle?
                </label>

                <select
                  value={hasVehicle}
                  onChange={(e) => setHasVehicle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                >
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-passport"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Passport photo
                </label>

                <input
                  id="rider-passport"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    setPassportPhoto(
                      e.target.files?.[0] || null
                    )
                  }
                />

                <small>
                  JPG, PNG or WEBP. Maximum 5MB.
                </small>
              </div>

              <div style={{ marginTop: "14px" }}>
                <label
                  htmlFor="rider-student-document"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontWeight: "600",
                  }}
                >
                  Student ID / verification document
                </label>

                <input
                  id="rider-student-document"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) =>
                    setStudentIdDocument(
                      e.target.files?.[0] || null
                    )
                  }
                />

                <small>
                  JPG, PNG, WEBP or PDF. Maximum 5MB.
                </small>
              </div>

              <button
                type="submit"
                disabled={submittingApplication}
                style={{
                  marginTop: "20px",
                  padding: "12px 18px",
                }}
              >
                {submittingApplication
                  ? "Submitting..."
                  : "Submit Rider Application"}
              </button>
            </form>
          )}

          {application && (
            <div className="dashboard-card">
              <span style={{ fontSize: "28px" }}>🚴</span>

              <h3>Rider Application</h3>

              <p>
                <strong>Name:</strong>{" "}
                {profileName || application.full_name}
              </p>

              <p>
                <strong>Phone:</strong> {application.phone}
              </p>

              <p>
                <strong>Department:</strong>{" "}
                {application.department || "Not provided"}
              </p>

              <p>
                <strong>Level:</strong>{" "}
                {application.level || "Not provided"}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {application.status === "pending"
                  ? "Pending review"
                  : application.status === "approved"
                  ? "Approved"
                  : "Rejected"}
              </p>

              {application.status === "pending" && (
                <p>
                  Your application has been received. Please wait
                  for an admin to review it.
                </p>
              )}

              {application.status === "approved" && (
                <div>
                  <p>Your application has been approved.</p>

                  <p>
                    Your rider account is currently waiting to be
                    activated. Please refresh your dashboard
                    shortly.
                  </p>
                </div>
              )}

              {application.status === "rejected" && (
                <>
                  <p>
                    Your application was not approved at this
                    time.
                  </p>

                  {application.admin_note && (
                    <p>
                      <strong>Admin note:</strong>{" "}
                      {application.admin_note}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Home
        </button>

        <div className="dashboard-header">
          <p className="welcome-small">
            DELIVERY PARTNERS
          </p>

          <h1>Rider Dashboard</h1>

          <p>
            Manage your deliveries and delivery prices for
            different locations around UniAbuja.
          </p>
        </div>

        {message && (
          <div className="dashboard-card">
            <p>{message}</p>
          </div>
        )}

        <div className="dashboard-card">
          <h3>Rider Account</h3>

          <p>Your account is approved and active.</p>

          <p>
            <strong>Rider:</strong>{" "}
            {profileName || "Rider"}
          </p>

          <p style={{ marginTop: "8px", opacity: 0.8 }}>
            Manage your assigned deliveries below and set your
            proposed delivery prices for each location.
          </p>
        </div>

        {/* PAYOUT ACCOUNT */}
        <div
          className="dashboard-header"
          style={{ marginTop: "32px" }}
        >
          <h2>Payout Account</h2>

          <p>
            Add or update the bank account where your delivery
            earnings will be paid.
          </p>
        </div>

        <div className="dashboard-card">
          {payoutLoading ? (
            <p>Loading payout account...</p>
          ) : payoutAccount && !payoutEditing ? (
            <>
              <div
                style={{
                  padding: "12px",
                  marginBottom: "18px",
                  borderRadius: "8px",
                  background: "#f5f5f5",
                }}
              >
                <p>
                  <strong>Account status:</strong>{" "}
                  {payoutAccount.is_active
                    ? "Active"
                    : "Inactive"}
                </p>

                <p style={{ marginTop: "6px" }}>
                  <strong>Verification:</strong>{" "}
                  {payoutAccount.is_verified
                    ? "Verified"
                    : "Pending verification"}
                </p>

                <p style={{ marginTop: "6px" }}>
                  <strong>Account name:</strong>{" "}
                  {payoutAccount.account_name || "Not available"}
                </p>

                <p style={{ marginTop: "6px" }}>
                  <strong>Bank:</strong>{" "}
                  {payoutAccount.bank_name || "Bank"}
                </p>

                <p style={{ marginTop: "6px" }}>
                  <strong>Account number:</strong>{" "}
                  {maskAccountNumber(
                    payoutAccount.account_number
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={startEditingPayout}
                style={{
                  padding: "12px 18px",
                }}
              >
                Update Payout Account
              </button>

              <p
                style={{
                  marginTop: "14px",
                  fontSize: "13px",
                  opacity: 0.7,
                }}
              >
                Your bank details are verified through Paystack.
                Updating the account will require verification
                again.
              </p>
            </>
          ) : (
            <>
              <form onSubmit={savePayoutAccount}>
                <div>
                  <label
                    htmlFor="payout-bank"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Bank
                  </label>

                  <select
                    id="payout-bank"
                    value={selectedPayoutBank}
                    onChange={(e) =>
                      handlePayoutBankChange(e.target.value)
                    }
                    disabled={loadingBanks || verifyingPayout}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                    required
                  >
                    <option value="">
                      {loadingBanks
                        ? "Loading banks..."
                        : "Select your bank"}
                    </option>

                    {payoutBanks.map((bank) => (
                      <option
                        key={bank.code}
                        value={bank.code}
                      >
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <label
                    htmlFor="payout-account-number"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Account number
                  </label>

                  <input
                    id="payout-account-number"
                    type="text"
                    inputMode="numeric"
                    maxLength="10"
                    value={payoutAccountNumber}
                    onChange={(e) => {
                      setPayoutAccountNumber(
                        e.target.value.replace(/\D/g, "")
                      );

                      setPayoutAccountName("");
                    }}
                    placeholder="10-digit account number"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={verifyPayoutAccount}
                  disabled={
                    verifyingPayout ||
                    loadingBanks ||
                    !selectedPayoutBank ||
                    payoutAccountNumber.length !== 10
                  }
                  style={{
                    marginTop: "16px",
                    padding: "12px 18px",
                  }}
                >
                  {verifyingPayout
                    ? "Verifying..."
                    : "Verify Account"}
                </button>

                {payoutAccountName && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px",
                      borderRadius: "8px",
                      background: "#f5f5f5",
                    }}
                  >
                    <p>
                      <strong>Account name:</strong>{" "}
                      {payoutAccountName}
                    </p>

                    <p
                      style={{
                        marginTop: "6px",
                        color: "green",
                      }}
                    >
                      ✓ Account verified
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    savingPayout ||
                    !payoutAccountName ||
                    verifyingPayout
                  }
                  style={{
                    marginTop: "20px",
                    padding: "12px 18px",
                  }}
                >
                  {savingPayout
                    ? "Saving..."
                    : payoutAccount
                    ? "Save Updated Account"
                    : "Save Payout Account"}
                </button>

                {payoutEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayoutEditing(false);
                      setPayoutAccountName(
                        payoutAccount?.account_name || ""
                      );
                      setPayoutBankName(
                        payoutAccount?.bank_name || ""
                      );
                      setPayoutBankCode(
                        payoutAccount?.bank_code || ""
                      );
                      setSelectedPayoutBank(
                        payoutAccount?.bank_code || ""
                      );
                      setPayoutAccountNumber(
                        payoutAccount?.account_number || ""
                      );
                      setMessage("");
                    }}
                    style={{
                      marginTop: "10px",
                      marginLeft: "8px",
                      padding: "12px 18px",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </form>

              <p
                style={{
                  marginTop: "14px",
                  fontSize: "13px",
                  opacity: 0.7,
                }}
              >
                Select your bank and enter your 10-digit account
                number. Paystack will verify the account and
                return the account name automatically.
              </p>
            </>
          )}
        </div>

        {/* AVAILABLE DELIVERIES */}
        <div
          className="dashboard-header"
          style={{ marginTop: "32px" }}
        >
          <h2>Available Deliveries</h2>

          <p>
            Paid delivery orders available for riders in your
            approved delivery areas.
          </p>
        </div>

        {availableDeliveriesLoading ? (
          <div className="dashboard-card">
            <p>Checking for available deliveries...</p>
          </div>
        ) : availableDeliveries.length === 0 ? (
          <div className="dashboard-card">
            <div style={{ fontSize: "30px" }}>🔎</div>

            <h3>No available deliveries</h3>

            <p>
              New paid rider deliveries that match your approved
              delivery areas will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {availableDeliveries.map((delivery) => (
              <div
                key={delivery.delivery_id}
                className="dashboard-card"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "24px" }}>
                      📦
                    </span>

                    <h3>
                      Delivery #
                      {String(delivery.delivery_id).slice(0, 8)}
                    </h3>
                  </div>

                  <span className="order-status status-pending">
                    Available
                  </span>
                </div>

                <p style={{ marginTop: "12px" }}>
                  <strong>Delivery fee:</strong>{" "}
                  {formatNaira(delivery.delivery_fee)}
                </p>

                {delivery.delivery_address && (
                  <p style={{ marginTop: "8px" }}>
                    <strong>Address:</strong>{" "}
                    {delivery.delivery_address}
                  </p>
                )}

                {delivery.customer_phone && (
                  <p style={{ marginTop: "8px" }}>
                    <strong>Customer phone:</strong>{" "}
                    {delivery.customer_phone}
                  </p>
                )}

                <p style={{ marginTop: "8px", opacity: 0.75 }}>
                  Posted:{" "}
                  {delivery.created_at
                    ? new Date(
                        delivery.created_at
                      ).toLocaleString()
                    : "Recently"}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    claimDelivery(delivery.delivery_id)
                  }
                  disabled={
                    claimingDelivery === delivery.delivery_id
                  }
                  style={{
                    marginTop: "16px",
                    padding: "12px 18px",
                    width: "100%",
                  }}
                >
                  {claimingDelivery === delivery.delivery_id
                    ? "Claiming..."
                    : "Claim Delivery"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ASSIGNED DELIVERIES */}
        <div
          className="dashboard-header"
          style={{ marginTop: "32px" }}
        >
          <h2>My Deliveries</h2>

          <p>Orders assigned to you for delivery.</p>
        </div>

        {deliveriesLoading ? (
          <div className="dashboard-card">
            <p>Loading your deliveries...</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="dashboard-card">
            <div style={{ fontSize: "30px" }}>📦</div>

            <h3>No assigned deliveries</h3>

            <p>
              Deliveries assigned to you will appear here.
            </p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="dashboard-card"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "24px" }}>
                      🚴
                    </span>

                    <h3>
                      Delivery #{delivery.id.slice(0, 8)}
                    </h3>
                  </div>

                  <span
                    className={`order-status status-${delivery.status}`}
                  >
                    {formatDeliveryStatus(
                      delivery.status
                    )}
                  </span>
                </div>

                <p style={{ marginTop: "12px" }}>
                  <strong>Delivery fee:</strong>{" "}
                  {formatNaira(delivery.delivery_fee)}
                </p>

                {delivery.pickup_code && (
                  <p>
                    <strong>Pickup code:</strong>{" "}
                    {delivery.pickup_code}
                  </p>
                )}

                {delivery.delivery_code && (
                  <p>
                    <strong>Delivery code:</strong>{" "}
                    {delivery.delivery_code}
                  </p>
                )}

                <p style={{ marginTop: "8px", opacity: 0.75 }}>
                  Assigned:{" "}
                  {new Date(
                    delivery.created_at
                  ).toLocaleString()}
                </p>

                <div style={{ marginTop: "16px" }}>
                  <OrderChat
                    user={user}
                    vendorOrderId={delivery.vendor_order_id}
                    title="Chat about this delivery"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {zones.length === 0 ? (
          <div
            className="dashboard-card"
            style={{ marginTop: "24px" }}
          >
            <h3>No delivery zones available</h3>

            <p>
              There are currently no active delivery zones.
              Please check again later.
            </p>
          </div>
        ) : (
          <>
            <div
              className="dashboard-header"
              style={{ marginTop: "32px" }}
            >
              <h2>Delivery Areas & Prices</h2>

              <p>
                Submit the amount you propose for each delivery
                location. Admin approval is required before a
                zone price becomes active.
              </p>
            </div>

            <div className="dashboard-grid">
              {zones.map((zone) => {
                const rate = existingRates[zone.id];

                const approved =
                  rate &&
                  rate.approval_status === "approved" &&
                  rate.approved_fee !== null &&
                  rate.is_active;

                return (
                  <div
                    key={zone.id}
                    className="dashboard-card"
                  >
                    <span style={{ fontSize: "24px" }}>
                      📍
                    </span>

                    <h3>{zone.name}</h3>

                    {approved ? (
                      <div>
                        <p>
                          <strong>Active price:</strong>{" "}
                          {formatNaira(rate.approved_fee)}
                        </p>

                        <p style={{ marginTop: "6px" }}>
                          Status:{" "}
                          <strong>Approved</strong>
                        </p>
                      </div>
                    ) : rate ? (
                      <div>
                        <p>
                          <strong>Proposed:</strong>{" "}
                          {formatNaira(rate.proposed_fee)}
                        </p>

                        <p style={{ marginTop: "6px" }}>
                          Status:{" "}
                          <strong>
                            {rate.approval_status === "pending"
                              ? "Pending admin approval"
                              : rate.approval_status}
                          </strong>
                        </p>
                      </div>
                    ) : (
                      <p>
                        No price submitted for this location
                        yet.
                      </p>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginTop: "12px",
                      }}
                    >
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={fees[zone.id] ?? ""}
                        onChange={(e) =>
                          handleFeeChange(
                            zone.id,
                            e.target.value
                          )
                        }
                        placeholder="Proposed fee"
                        style={{
                          width: "130px",
                          padding: "10px",
                          border: "1px solid #ccc",
                          borderRadius: "8px",
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => saveFee(zone.id)}
                        disabled={savingZone === zone.id}
                      >
                        {savingZone === zone.id
                          ? "Saving..."
                          : "Submit"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}