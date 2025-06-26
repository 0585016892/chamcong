import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import axios from "axios";
import {
  Container,
  Row,
  Col,
  Card,
  Spinner,
  Badge,
  Alert,
} from "react-bootstrap";
const FaceCheckin = () => {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [labeledDescriptors, setLabeledDescriptors] = useState([]);
  const [labelMap, setLabelMap] = useState({});
  const [checkedInUsers, setCheckedInUsers] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [currentAction, setCurrentAction] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models";
      console.log("🔄 Tải mô hình...");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      ]);
      console.log("✅ Mô hình đã tải.");
      await startCamera();
      await loadLabeledFaces();
    };

    loadModels();
  }, []);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
  };

  const loadLabeledFaces = async () => {
    const res = await axios.get(
      "https://finlyapi-production.up.railway.app/api/face/labels"
    );
    const data = res.data;

    const descriptors = await Promise.all(
      data.map(async (emp) => {
        if (!emp.avatar) return null;
        try {
          const img = await faceapi.fetchImage(
            `https://finlyapi-production.up.railway.app${emp.avatar}`
          );
          const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!detection) return null;
          return new faceapi.LabeledFaceDescriptors(emp.label, [
            detection.descriptor,
          ]);
        } catch {
          return null;
        }
      })
    );

    const labelToIdMap = {};
    data.forEach((emp) => {
      labelToIdMap[emp.label] = emp.id;
    });

    setLabelMap(labelToIdMap);
    setLabeledDescriptors(descriptors.filter(Boolean));
  };

  const speakGreeting = (name) => {
    const msg = new SpeechSynthesisUtterance(`Xin chào ${name}`);
    msg.lang = "vi-VN";
    window.speechSynthesis.speak(msg);
  };

  const submitAttendance = async (user_id, videoElement, label) => {
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append("user_id", user_id);
        formData.append("img_checkin", blob, `${user_id}.jpg`);

        try {
          // Gửi check-in
          const res = await axios.post(
            "https://finlyapi-production.up.railway.app/api/face/attendance",
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
            }
          );
          const status = res.data.status;
          const timeStr = new Date(res.data.time).toLocaleTimeString("vi-VN");

          if (status === "checked-in") {
            speakGreeting(label);
          } else if (status === "already checked-in") {
            // Đã check-in rồi, giờ thử check-out

            const checkoutForm = new FormData();
            checkoutForm.append("user_id", user_id);
            checkoutForm.append("img_checkout", blob, `${user_id}.jpg`);

            try {
              const outRes = await axios.post(
                "https://finlyapi-production.up.railway.app/api/face/checkout",
                checkoutForm
              );
              if (outRes.data.status === "checked-out") {
                const outTimeStr = new Date(
                  outRes.data.time
                ).toLocaleTimeString("vi-VN");
                speakGreeting(` Xin chào ${label}. Chúc bạn buổi tối vui vẻ!`);
              } else {
                console.log(`✅ ${label} đã check-out trước đó.`);
              }
            } catch (err) {
              console.error("❌ Lỗi check-out:", err);
            }
          }
        } catch (err) {
          console.error("❌ Lỗi gửi ảnh check-in:", err);
        }

        resolve();
      }, "image/jpeg");
    });
  };

  useEffect(() => {
    if (labeledDescriptors.length === 0) return;

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

    const interval = setInterval(async () => {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();

      const displaySize = {
        width: videoRef.current.width,
        height: videoRef.current.height,
      };
      faceapi.matchDimensions(canvasRef.current, displaySize);
      const resized = faceapi.resizeResults(detections, displaySize);
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      for (const det of resized) {
        const match = faceMatcher.findBestMatch(det.descriptor);
        const label = match.label;
        const box = det.detection.box;

        new faceapi.draw.DrawBox(box, { label }).draw(canvasRef.current);

        if (label !== "unknown" && !checkedInUsers.has(label)) {
          const user_id = labelMap[label];
          if (user_id) {
            setCheckedInUsers((prev) => new Set(prev).add(label)); // ✅ ngăn gọi nhiều lần
            await submitAttendance(user_id, videoRef.current, label);
          } else {
            console.warn("❌ Không tìm thấy user_id cho label:", label);
          }
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [labeledDescriptors]);

  return (
    <Container className="mt-4 text-center">
      <Row className="justify-content-center">
        <Col md={10}>
          <Card>
            {" "}
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <video
                  ref={videoRef}
                  width={720}
                  height={560}
                  autoPlay
                  muted
                  style={{ border: "1px solid #ccc" }}
                />
                <canvas
                  ref={canvasRef}
                  width={720}
                  height={560}
                  style={{ position: "absolute", top: 0, left: 0 }}
                />
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default FaceCheckin;
