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

  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [availableDeliveriesLoading, setAvailableDeliveriesLoading] =
    useState(false);

  const [refreshingDeliveries, setRefreshingDeliveries] = useState(false);

  const [deliveryCodes, setDeliveryCodes] = useState({});
  const [deliveryDetails, setDeliveryDetails] = useState({});
  const [deliveryAction, setDeliveryAction] = useState(null);

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
      setMessage("Please log in first.");
    }
  }, [user]);

  /*
    Automatic rider dashboard refresh.

    This keeps the dashboard synchronized when:
    - vendor accepts the order
    - vendor starts processing
    - vendor marks the order ready
    - rider request status changes

    No database changes are required.
  */
  useEffect(() => {
    if (!user || !isRider) {
      return;
    }

    const interval = setInterval(() => {
      loadAssignedDeliveries(false);
      loadAvailableDeliveries(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [user, isRider]);

  async function refreshDeliveries() {
    if (!user || !isRider || refreshingDeliveries) {
      return;
    }

    setRefreshingDeliveries(true);
    setMessage("");

    try {
      await Promise.all([
        loadAvailableDeliveries(true),
        loadAssignedDeliveries(true),
      ]);
    } finally {
      setRefreshingDeliveries(false);
    }
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    const { data: profileData, error: profileError } = await supabase
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

    const { data: riderDataResult, error: riderError } = await supabase
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

    await Promise.all([
      loadAssignedDeliveries(true),
      loadAvailableDeliveries(true),
    ]);

    setLoading(false);
  }

  async function loadAssignedDeliveries(showLoading = true) {
    if (showLoading) {
      setDeliveriesLoading(true);
    }

    const { data, error } = await supabase
      .from("deliveries")
      .select(
        `
          id,
          vendor_order_id,
          delivery_method,
          delivery_fee,
          status,
          delivered_at,
          created_at,
          updated_at,
          rider_request_status
        `
      )
      .eq("rider_id", user.id)
      .eq("rider_request_status", "accepted")
      .eq("delivery_method", "rider")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Assigned deliveries error:", error);
      setMessage(error.message);

      if (showLoading) {
        setDeliveriesLoading(false);
      }

      return;
    }

    const assignedDeliveries = data || [];

    console.log(
      "RIDER DELIVERY DATA:",
      assignedDeliveries.map((delivery) => ({
        id: delivery.id,
        vendor_order_id: delivery.vendor_order_id,
        status: delivery.status,
        delivery_method: delivery.delivery_method,
        rider_request_status: delivery.rider_request_status,
        rider_id: user.id,
      }))
    );

    const detailResults = await Promise.all(
      assignedDeliveries.map(async (delivery) => {
        const { data: detail, error: detailError } =
          await supabase.rpc(
            "get_rider_delivery_details",
            {
              p_delivery_id: delivery.id,
            }
          );

        if (detailError) {
          console.error(
            "Delivery details error:",
            delivery.id,
            detailError
          );

          return null;
        }

        return {
          deliveryId: delivery.id,
          detail: Array.isArray(detail)
            ? detail[0] || null
            : detail || null,
        };
      })
    );

    const detailsMap = {};

    detailResults.forEach((result) => {
      if (result?.deliveryId && result?.detail) {
        detailsMap[result.deliveryId] = result.detail;
      }
    });

    setDeliveryDetails(detailsMap);
    setDeliveries(assignedDeliveries);

    if (showLoading) {
      setDeliveriesLoading(false);
    }
  }

  async function loadAvailableDeliveries(showLoading = true) {
    if (showLoading) {
      setAvailableDeliveriesLoading(true);
    }

    const { data, error } = await supabase.rpc(
      "get_available_rider_deliveries"
    );

    if (error) {
      console.error(
        "Available deliveries error:",
        error
      );

      setAvailableDeliveries([]);

      if (showLoading) {
        setAvailableDeliveriesLoading(false);
      }

      return;
    }

    setAvailableDeliveries(data || []);

    if (showLoading) {
      setAvailableDeliveriesLoading(false);
    }
  }

  async function acceptDelivery(requestId) {
    if (!requestId || deliveryAction) {
      return;
    }

    setDeliveryAction(`accept-${requestId}`);
    setMessage("");

    const { error } = await supabase.rpc(
      "accept_delivery_rider_request",
      {
        p_request_id: requestId,
      }
    );

    if (error) {
      console.error(
        "Accept rider request error:",
        error
      );

      setMessage(
        error?.message ||
          "This delivery request could not be accepted. It may no longer be available."
      );

      setDeliveryAction(null);

      await loadAvailableDeliveries(true);
      await loadAssignedDeliveries(true);

      return;
    }

    setMessage(
      "Delivery accepted. Customer delivery details are now available."
    );

    setDeliveryAction(null);

    await loadAvailableDeliveries(true);
    await loadAssignedDeliveries(true);
  }

  async function rejectDelivery(requestId) {
    if (!requestId || deliveryAction) {
      return;
    }

    setDeliveryAction(`reject-${requestId}`);
    setMessage("");

    const { error } = await supabase.rpc(
      "reject_delivery_rider_request",
      {
        p_request_id: requestId,
      }
    );

    if (error) {
      console.error(
        "Reject rider request error:",
        error
      );

      setMessage(
        error?.message ||
          "This delivery request could not be rejected."
      );

      setDeliveryAction(null);

      return;
    }

    setMessage("Delivery request rejected.");

    setDeliveryAction(null);

    await loadAvailableDeliveries(true);
    await loadAssignedDeliveries(true);
  }

  async function startDelivery(delivery) {
    if (delivery.status !== "ready") {
      setMessage(
        "The vendor must mark the order as ready before you can start the delivery."
      );
      return;
    }

    setDeliveryAction(`start-${delivery.id}`);
    setMessage("");

    const { error } = await supabase.rpc(
      "start_delivery",
      {
        p_delivery_id: delivery.id,
      }
    );

    if (error) {
      console.error(
        "Start delivery error:",
        error
      );

      setMessage(
        error?.message ||
          "Unable to start this delivery."
      );

      setDeliveryAction(null);
      return;
    }

    setMessage(
      "Delivery started. Meet the customer and collect the 4-digit completion PIN when you hand over the order."
    );

    setDeliveryAction(null);

    await loadAssignedDeliveries(true);
  }

  async function confirmDelivery(delivery) {
    const code = String(
      deliveryCodes[delivery.id] || ""
    ).trim();

    if (delivery.status !== "out_for_delivery") {
      setMessage(
        "This delivery is not currently out for delivery."
      );
      return;
    }

    if (!/^\d{4}$/.test(code)) {
      setMessage(
        "Enter the 4-digit delivery PIN provided by the customer."
      );
      return;
    }

    setDeliveryAction(`delivery-${delivery.id}`);
    setMessage("");

    const { error } = await supabase.rpc(
      "confirm_delivery_delivery",
      {
        p_delivery_id: delivery.id,
        p_delivery_code: code,
      }
    );

    if (error) {
      console.error(
        "Confirm delivery error:",
        error
      );

      setMessage(
        error?.message ||
          "The delivery PIN is incorrect or this delivery cannot be completed yet."
      );

      setDeliveryAction(null);
      return;
    }

    setDeliveryCodes((current) => ({
      ...current,
      [delivery.id]: "",
    }));

    setMessage(
      "Delivery completed successfully."
    );

    setDeliveryAction(null);

    await loadAssignedDeliveries(true);
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
          emergency_contact_name:
            emergencyContactName.trim(),
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

  function formatDeliveryStatus(status) {
    if (!status) {
      return "Unknown";
    }

    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
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
              Join the UniAbuja Market delivery network and
              earn by delivering orders to students.
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
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
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
                  onChange={(e) =>
                    setAddress(e.target.value)
                  }
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
                  onChange={(e) =>
                    setLevel(e.target.value)
                  }
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
                  onChange={(e) =>
                    setHasVehicle(e.target.value)
                  }
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
                <strong>Phone:</strong>{" "}
                {application.phone}
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
                  Your application has been received. Please
                  wait for an admin to review it.
                </p>
              )}

              {application.status === "approved" && (
                <div>
                  <p>
                    Your application has been approved.
                  </p>

                  <p>
                    Your rider account is currently waiting
                    to be activated. Please refresh your
                    dashboard shortly.
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
            Manage rider requests and complete deliveries
            for UniAbuja Market orders.
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

          <p
            style={{
              marginTop: "8px",
              opacity: 0.8,
            }}
          >
            When a vendor sends you a delivery request,
            review the pickup information carefully before
            accepting. Customer delivery details become
            available after you accept the request.
          </p>
        </div>

        {/* DELIVERY REQUESTS */}
        <div
          className="dashboard-header"
          style={{
            marginTop: "32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2>Delivery Requests</h2>

            <p>
              Vendors may send you delivery requests for
              orders that need rider assistance.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshDeliveries}
            disabled={refreshingDeliveries}
            style={{
              padding: "10px 16px",
            }}
          >
            {refreshingDeliveries
              ? "Refreshing..."
              : "↻ Refresh Requests"}
          </button>
        </div>

        {availableDeliveriesLoading ? (
          <div className="dashboard-card">
            <p>
              Checking for delivery requests...
            </p>
          </div>
        ) : availableDeliveries.length === 0 ? (
          <div className="dashboard-card">
            <div style={{ fontSize: "30px" }}>
              🔎
            </div>

            <h3>No delivery requests</h3>

            <p>
              New delivery requests from vendors will
              appear here after they send one to you.
            </p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {availableDeliveries.map((request) => {
              const requestId =
                request.request_id ||
                request.delivery_id;

              return (
                <div
                  key={requestId}
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
                      <span
                        style={{
                          fontSize: "24px",
                        }}
                      >
                        📦
                      </span>

                      <h3>
                        Delivery #
                        {String(
                          request.delivery_id
                        ).slice(0, 8)}
                      </h3>
                    </div>

                    <span className="order-status status-pending">
                      Request
                    </span>
                  </div>

                  <p
                    style={{
                      marginTop: "12px",
                    }}
                  >
                    <strong>Pickup location:</strong>{" "}
                    {request.pickup_store_name ||
                      "Vendor store"}
                  </p>

                  <p
                    style={{
                      marginTop: "8px",
                    }}
                  >
                    <strong>Address:</strong>{" "}
                    {request.pickup_location ||
                      "Pickup location not provided"}
                  </p>

                  <p
                    style={{
                      marginTop: "8px",
                      opacity: 0.75,
                    }}
                  >
                    Request received:{" "}
                    {request.created_at
                      ? new Date(
                          request.created_at
                        ).toLocaleString()
                      : "Recently"}
                  </p>

                  <div
                    style={{
                      marginTop: "16px",
                      padding: "14px",
                      borderRadius: "8px",
                      background: "#f5f5f5",
                    }}
                  >
                    <p>
                      <strong>
                        Review before accepting
                      </strong>
                    </p>

                    <p
                      style={{
                        marginTop: "8px",
                      }}
                    >
                      Check the pickup information
                      carefully before accepting this
                      request.
                    </p>

                    <p
                      style={{
                        marginTop: "8px",
                      }}
                    >
                      Customer delivery address and phone
                      number will become available only
                      after you accept the request.
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "16px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        acceptDelivery(requestId)
                      }
                      disabled={
                        deliveryAction ===
                          `accept-${requestId}` ||
                        deliveryAction !== null
                      }
                      style={{
                        padding: "12px 18px",
                        flex: 1,
                      }}
                    >
                      {deliveryAction ===
                      `accept-${requestId}`
                        ? "Accepting..."
                        : "Accept"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        rejectDelivery(requestId)
                      }
                      disabled={
                        deliveryAction ===
                          `reject-${requestId}` ||
                        deliveryAction !== null
                      }
                      style={{
                        padding: "12px 18px",
                        flex: 1,
                      }}
                    >
                      {deliveryAction ===
                      `reject-${requestId}`
                        ? "Rejecting..."
                        : "Reject"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MY DELIVERIES */}
        <div
          className="dashboard-header"
          style={{ marginTop: "32px" }}
        >
          <h2>My Deliveries</h2>

          <p>
            Deliveries you have accepted from vendors.
          </p>
        </div>

        {deliveriesLoading ? (
          <div className="dashboard-card">
            <p>Loading your deliveries...</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="dashboard-card">
            <div style={{ fontSize: "30px" }}>
              📦
            </div>

            <h3>No accepted deliveries</h3>

            <p>
              Deliveries you accept will appear here.
            </p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {deliveries.map((delivery) => {
              const details =
                deliveryDetails[delivery.id];

              const customerDetailsAvailable =
                delivery.rider_request_status ===
                "accepted";

              return (
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
                      <span
                        style={{
                          fontSize: "24px",
                        }}
                      >
                        🚴
                      </span>

                      <h3>
                        Delivery #
                        {delivery.id.slice(0, 8)}
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

                  {/* ACCEPTED / WAITING FOR ORDER */}
                  {delivery.status === "pending" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          Delivery accepted.
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        The order is still waiting to
                        move forward.
                      </p>
                    </div>
                  )}

                  {/* ORDER ACCEPTED */}
                  {delivery.status === "accepted" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          Order accepted.
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        The vendor will prepare the
                        order before marking it ready.
                      </p>
                    </div>
                  )}

                  {/* PROCESSING */}
                  {delivery.status === "processing" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          Vendor is preparing the order.
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        Wait for the vendor to mark the
                        order ready before going to
                        collect it.
                      </p>

                      {details?.pickup_location && (
                        <p
                          style={{
                            marginTop: "10px",
                          }}
                        >
                          <strong>
                            Pickup location:
                          </strong>{" "}
                          {details.pickup_location}
                        </p>
                      )}

                      {details?.pickup_store_name && (
                        <p
                          style={{
                            marginTop: "8px",
                          }}
                        >
                          <strong>Store:</strong>{" "}
                          {details.pickup_store_name}
                        </p>
                      )}
                    </div>
                  )}

                  {/* READY */}
                  {delivery.status === "ready" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          The order is ready.
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        Go to the vendor's pickup
                        location and collect the order.
                      </p>

                      <p
                        style={{
                          marginTop: "10px",
                        }}
                      >
                        <strong>
                          Pickup location:
                        </strong>{" "}
                        {details?.pickup_location ||
                          details?.pickup_address ||
                          "Loading pickup location..."}
                      </p>

                      {details?.pickup_store_name && (
                        <p
                          style={{
                            marginTop: "8px",
                          }}
                        >
                          <strong>Store:</strong>{" "}
                          {details.pickup_store_name}
                        </p>
                      )}

                      {customerDetailsAvailable && (
                        <div
                          style={{
                            marginTop: "14px",
                            paddingTop: "14px",
                            borderTop:
                              "1px solid #ddd",
                          }}
                        >
                          <p>
                            <strong>
                              Customer delivery details
                            </strong>
                          </p>

                          <p
                            style={{
                              marginTop: "8px",
                            }}
                          >
                            <strong>
                              Address:
                            </strong>{" "}
                            {details?.delivery_address ||
                              "Loading address..."}
                          </p>

                          <p
                            style={{
                              marginTop: "8px",
                            }}
                          >
                            <strong>
                              Phone:
                            </strong>{" "}
                            {details?.customer_phone ||
                              "Loading phone..."}
                          </p>
                        </div>
                      )}

                      <p
                        style={{
                          marginTop: "12px",
                        }}
                      >
                        Once you have collected the
                        order from the vendor, tap
                        <strong> Start Delivery</strong>.
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          startDelivery(delivery)
                        }
                        disabled={
                          deliveryAction ===
                          `start-${delivery.id}`
                        }
                        style={{
                          marginTop: "14px",
                          padding: "12px 18px",
                          width: "100%",
                        }}
                      >
                        {deliveryAction ===
                        `start-${delivery.id}`
                          ? "Starting..."
                          : "Start Delivery"}
                      </button>
                    </div>
                  )}

                  {/* OUT FOR DELIVERY */}
                  {delivery.status ===
                    "out_for_delivery" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          Customer delivery details
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        <strong>Address:</strong>{" "}
                        {details?.delivery_address ||
                          "Loading address..."}
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        <strong>Phone:</strong>{" "}
                        {details?.customer_phone ||
                          "Loading phone..."}
                      </p>

                      <p
                        style={{
                          marginTop: "12px",
                        }}
                      >
                        Ask the customer for the 4-digit
                        completion PIN shown in their
                        My Orders page.
                      </p>

                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength="4"
                        value={
                          deliveryCodes[
                            delivery.id
                          ] || ""
                        }
                        onChange={(e) =>
                          setDeliveryCodes(
                            (current) => ({
                              ...current,
                              [delivery.id]:
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 4),
                            })
                          )
                        }
                        placeholder="Enter customer PIN"
                        style={{
                          width: "100%",
                          marginTop: "12px",
                          padding: "12px",
                          border:
                            "1px solid #ccc",
                          borderRadius: "8px",
                          letterSpacing: "4px",
                          textAlign: "center",
                          fontSize: "18px",
                        }}
                      />

                      <button
                        type="button"
                        onClick={() =>
                          confirmDelivery(delivery)
                        }
                        disabled={
                          deliveryAction ===
                          `delivery-${delivery.id}`
                        }
                        style={{
                          marginTop: "12px",
                          padding: "12px 18px",
                          width: "100%",
                        }}
                      >
                        {deliveryAction ===
                        `delivery-${delivery.id}`
                          ? "Confirming..."
                          : "Confirm Delivery"}
                      </button>
                    </div>
                  )}

                  {/* DELIVERED */}
                  {delivery.status === "delivered" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          ✓ Delivery completed
                        </strong>
                      </p>

                      {delivery.delivered_at && (
                        <p
                          style={{
                            marginTop: "8px",
                            opacity: 0.75,
                          }}
                        >
                          Delivered:{" "}
                          {new Date(
                            delivery.delivered_at
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* CANCELLED */}
                  {delivery.status === "cancelled" && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#f5f5f5",
                      }}
                    >
                      <p>
                        <strong>
                          Delivery cancelled
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: "8px",
                        }}
                      >
                        This delivery is no longer active.
                      </p>
                    </div>
                  )}

                  <p
                    style={{
                      marginTop: "12px",
                      opacity: 0.75,
                    }}
                  >
                    Accepted:{" "}
                    {delivery.created_at
                      ? new Date(
                          delivery.created_at
                        ).toLocaleString()
                      : "Recently"}
                  </p>

                  <div
                    style={{
                      marginTop: "16px",
                    }}
                  >
                    <OrderChat
                      user={user}
                      vendorOrderId={
                        delivery.vendor_order_id
                      }
                      title="Chat about this delivery"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}