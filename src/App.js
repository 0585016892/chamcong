// App.js hoặc bất cứ trang nào:
import React from "react";
import FaceCheckin from "./components/FaceCheckin";

function App() {
  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <h2>📸 Nhận diện & Chấm công</h2>{" "}
      </div>
      <FaceCheckin />
    </div>
  );
}

export default App;
