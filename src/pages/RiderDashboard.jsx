import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import OrderChat from "../OrderChat";

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

  // Payout account
  const [payoutAccount, setPayoutAccount] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutBankName, setPayoutBankName] = useState("");
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
      setMessage("Please log in first.");
    }
  }, [user]);

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

    // Load payout account
    await loadPayoutAccount();

    await loadAssignedDeliveries();

    setLoading(false);
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

      // Do not block the entire dashboard if payout
      // account access has an RLS/configuration issue.
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
    }

    setPayoutLoading(false);
  }

  async function savePayoutAccount(e) {
    e.preventDefault();

    const accountName = payoutAccountName.trim();
    const bankName = payoutBankName.trim();
    const bankCode = payoutBankCode.trim();
    const accountNumber = payoutAccountNumber.replace(/\s/g, "");

    if (!accountName) {
      setMessage("Please enter your account name.");
      return;
    }

    if (!bankName) {
      setMessage("Please enter your bank name.");
      return;
    }

    if (!bankCode) {
      setMessage("Please enter your bank code.");
      return;
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      setMessage("Please enter a valid 10-digit account number.");
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
            bank_name: bankName,
            bank_code: bankCode,
            account_number: accountNumber,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payoutAccount.id)
          .eq("rider_id", user.id)
          .select()
          .single();

        if (error) {
          console.error("Update payout account error:", error);
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
            bank_name: bankName,
            bank_code: bankCode,
            account_number: accountNumber,
            is_verified: false,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          console.error("Create payout account error:", error);
          setMessage(error.message);
          setSavingPayout(false);
          return;
        }

        setPayoutAccount(data);

        setMessage(
          "Your payout account has been saved successfully."
        );
      }

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
          emergency_contact_phone: emergencyContactPhone.trim(),
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
          ) : (
            <>
              {payoutAccount && (
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
                    <strong>Current account:</strong>{" "}
                    {payoutAccount.bank_name || "Bank"} —{" "}
                    {maskAccountNumber(
                      payoutAccount.account_number
                    )}
                  </p>
                </div>
              )}

              <form onSubmit={savePayoutAccount}>
                <div>
                  <label
                    htmlFor="payout-account-name"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Account name
                  </label>

                  <input
                    id="payout-account-name"
                    type="text"
                    value={payoutAccountName}
                    onChange={(e) =>
                      setPayoutAccountName(e.target.value)
                    }
                    placeholder="Name on your bank account"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                    required
                  />
                </div>

                <div style={{ marginTop: "14px" }}>
                  <label
                    htmlFor="payout-bank-name"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Bank name
                  </label>

                  <input
                    id="payout-bank-name"
                    type="text"
                    value={payoutBankName}
                    onChange={(e) =>
                      setPayoutBankName(e.target.value)
                    }
                    placeholder="e.g. Access Bank"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                    required
                  />
                </div>

                <div style={{ marginTop: "14px" }}>
                  <label
                    htmlFor="payout-bank-code"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Bank code
                  </label>

                  <input
                    id="payout-bank-code"
                    type="text"
                    value={payoutBankCode}
                    onChange={(e) =>
                      setPayoutBankCode(e.target.value)
                    }
                    placeholder="Enter bank code"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                    required
                  />
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
                    onChange={(e) =>
                      setPayoutAccountNumber(
                        e.target.value.replace(/\D/g, "")
                      )
                    }
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
                  type="submit"
                  disabled={savingPayout}
                  style={{
                    marginTop: "20px",
                    padding: "12px 18px",
                  }}
                >
                  {savingPayout
                    ? "Saving..."
                    : payoutAccount
                    ? "Update Payout Account"
                    : "Save Payout Account"}
                </button>
              </form>

              <p
                style={{
                  marginTop: "14px",
                  fontSize: "13px",
                  opacity: 0.7,
                }}
              >
                Your verification status and Paystack recipient
                details are managed by UniAbuja Market.
              </p>
            </>
          )}
        </div>

        <div
          className="dashboard-header"
          style={{ marginTop: "24px" }}
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