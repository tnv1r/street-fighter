class MoveNetController {
  constructor() {
    this.detector = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.isRunning = false;
    this.keyStates = {};
    this.lastPose = null;
    this.confidenceThreshold = 0.7;
    this.frameSkip = 1;
    this.frameCount = 0;

    // Velocity tracking for better movement detection
    this.poseHistory = [];
    this.historyLength = 5;
    this.velocityThreshold = 0.005;

    // Simplified cooldown system
    this.cooldowns = {
      crouch: 0,
      punch: 0,
      hadouken: 0,
    };

    this.cooldownTimes = {
      crouch: 300,
      punch: 600,
      hadouken: 2000,
    };

    // Baseline pose with weighted averaging
    this.baselinePose = null;
    this.baselineFrames = 0;
    this.needsBaseline = true;
    this.baselineStability = 0;
  }

  async init() {
    console.log("🚀 Initializing MoveNet Controller with THUNDER model...");
    console.log("🎮 COMBAT DETECTION GUIDE:");
    console.log("🥊 ATTACKS:");
    console.log("   • LEFT PUNCH: Extend left arm forward");
    console.log("   • RIGHT PUNCH: Extend right arm forward");
    console.log(
      "   • HADOUKEN: Bring both hands together near your belly/waist"
    );
    console.log("⬇️ DEFENSIVE:");
    console.log("   • CROUCH: Bend your knees or squat down");
    console.log("💡 TIP: Stay centered, make clear deliberate movements!");
    console.log("🔧 DETECTION: More forgiving thresholds for easier gameplay!");

    try {
      // Setup overlay elements
      this.video = document.getElementById("movenet-video");
      this.canvas =
        document.getElementById("movenet-canvas") || this.createCanvas();
      this.ctx = this.canvas.getContext("2d");
      this.startButton = document.getElementById("start-movenet-btn");
      this.statusElement = document.getElementById("movenet-status");

      console.log("📱 DOM elements found:", {
        video: !!this.video,
        canvas: !!this.canvas,
        button: !!this.startButton,
        status: !!this.statusElement,
      });

      // Add event listener for start button
      this.startButton.addEventListener("click", () => this.toggleMoveNet());

      // Load MoveNet THUNDER model (more accurate)
      this.updateStatus("Loading MoveNet THUNDER model...");
      console.log("🧠 Loading MoveNet THUNDER model...");

      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        minPoseScore: 0.25,
      };

      this.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );

      console.log("✅ MoveNet THUNDER model loaded successfully!");
      this.updateStatus('Click "Start MoveNet" to begin body tracking');
      this.startButton.disabled = false;
    } catch (error) {
      console.error("❌ Error initializing MoveNet:", error);
      this.updateStatus("Error loading MoveNet. Please refresh the page.");
    }
  }

  createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.id = "movenet-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "10";
    canvas.style.pointerEvents = "none";
    canvas.style.border = "2px solid #00ff00";

    const video = document.getElementById("movenet-video");
    video.parentNode.insertBefore(canvas, video.nextSibling);

    return canvas;
  }

  async toggleMoveNet() {
    console.log("🔄 Toggling MoveNet, current state:", this.isRunning);

    if (!this.isRunning) {
      await this.startCamera();
    } else {
      this.stopCamera();
    }
  }

  async startCamera() {
    console.log("📷 Starting camera with higher resolution...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: "user",
        },
      });

      console.log("✅ Camera stream obtained");

      this.video.srcObject = stream;
      await this.video.play();
      this.video.style.display = "block";

      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;
      this.canvas.style.width = this.video.offsetWidth + "px";
      this.canvas.style.height = this.video.offsetHeight + "px";
      this.canvas.style.display = "block";

      this.isRunning = true;
      this.needsBaseline = true;
      this.baselineFrames = 0;
      this.baselineStability = 0;
      this.poseHistory = [];
      this.startButton.textContent = "Stop MoveNet";

      this.detectPoses();
      this.updateStatus(
        "🎯 Stand centered and still for 3 seconds to calibrate..."
      );

      console.log("🎯 Pose detection started - calibrating baseline...");
    } catch (error) {
      console.error("❌ Error accessing camera:", error);
      this.updateStatus("Camera access denied. Please allow camera access.");
    }
  }

  stopCamera() {
    console.log("🛑 Stopping camera...");

    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }

    this.video.style.display = "none";
    this.canvas.style.display = "none";
    this.isRunning = false;
    this.needsBaseline = true;
    this.poseHistory = [];
    this.startButton.textContent = "Start MoveNet";
    this.updateStatus('Body tracking stopped. Click "Start MoveNet" to begin.');

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.releaseAllKeys();
    console.log("✅ Camera stopped and keys released");
  }

  async detectPoses() {
    if (!this.isRunning || !this.detector) return;

    this.frameCount++;

    this.updateCooldowns();

    try {
      const poses = await this.detector.estimatePoses(this.video);

      if (poses.length > 0 && poses[0].score > 0.25) {
        const pose = poses[0];

        this.updatePoseHistory(pose);

        this.drawPoseOverlay(pose);

        if (this.needsBaseline) {
          this.establishBaseline(pose);
        } else {
          this.processPose(pose);
        }
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    } catch (error) {
      console.error("❌ Error detecting poses:", error);
    }

    requestAnimationFrame(() => this.detectPoses());
  }

  updatePoseHistory(pose) {
    this.poseHistory.push({
      pose: pose,
      timestamp: Date.now(),
    });

    if (this.poseHistory.length > this.historyLength) {
      this.poseHistory.shift();
    }
  }

  drawPoseOverlay(pose) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const keypoints = pose.keypoints;
    const scaleX = this.canvas.width / this.video.videoWidth;
    const scaleY = this.canvas.height / this.video.videoHeight;

    keypoints.forEach((keypoint) => {
      if (keypoint.score > this.confidenceThreshold) {
        const x = keypoint.x * scaleX;
        const y = keypoint.y * scaleY;

        const confidence = keypoint.score;
        const green = Math.floor(confidence * 255);
        const red = Math.floor((1 - confidence) * 255);

        this.ctx.fillStyle = `rgb(${red}, ${green}, 0)`;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
        this.ctx.fill();

        if (
          [
            "left_shoulder",
            "right_shoulder",
            "left_wrist",
            "right_wrist",
            "left_hip",
            "right_hip",
          ].includes(keypoint.name)
        ) {
          this.ctx.fillStyle = "white";
          this.ctx.font = "10px Arial";
          this.ctx.fillText(keypoint.name.split("_")[1], x + 6, y - 6);
        }
      }
    });

    if (this.baselinePose && !this.needsBaseline) {
      this.drawBaselineComparison(scaleX, scaleY);
    }

    this.ctx.fillStyle = "lime";
    this.ctx.font = "16px Arial";
    this.ctx.fillText(`Pose Score: ${pose.score.toFixed(2)}`, 10, 25);
    this.ctx.fillText(
      `Stability: ${this.baselineStability.toFixed(2)}`,
      10,
      45
    );
  }

  drawBaselineComparison(scaleX, scaleY) {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Draw center line for reference
    this.ctx.strokeStyle = "yellow";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, 0);
    this.ctx.lineTo(centerX, this.canvas.height);
    this.ctx.stroke();

    // Draw horizontal center line
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(this.canvas.width, centerY);
    this.ctx.stroke();
  }

  establishBaseline(pose) {
    this.baselineFrames++;

    if (this.baselineFrames === 1) {
      this.baselinePose = JSON.parse(JSON.stringify(pose));
      console.log("📏 Starting baseline calibration...");
    } else if (this.baselineFrames < 90) {
      const alpha = 0.1;
      pose.keypoints.forEach((kp, i) => {
        if (kp.score > this.confidenceThreshold) {
          const weight = kp.score;
          this.baselinePose.keypoints[i].x =
            this.baselinePose.keypoints[i].x * (1 - alpha * weight) +
            kp.x * alpha * weight;
          this.baselinePose.keypoints[i].y =
            this.baselinePose.keypoints[i].y * (1 - alpha * weight) +
            kp.y * alpha * weight;
          this.baselinePose.keypoints[i].score = Math.max(
            this.baselinePose.keypoints[i].score,
            kp.score
          );
        }
      });

      if (this.poseHistory.length > 1) {
        const prev = this.poseHistory[this.poseHistory.length - 2].pose;
        let totalMovement = 0;
        let validPoints = 0;

        pose.keypoints.forEach((kp, i) => {
          if (
            kp.score > this.confidenceThreshold &&
            prev.keypoints[i].score > this.confidenceThreshold
          ) {
            const dx = kp.x - prev.keypoints[i].x;
            const dy = kp.y - prev.keypoints[i].y;
            totalMovement += Math.sqrt(dx * dx + dy * dy);
            validPoints++;
          }
        });

        this.baselineStability =
          validPoints > 0 ? totalMovement / validPoints : 1;
      }
    } else {
      this.needsBaseline = false;
      console.log("✅ Baseline established! Ready for combat detection");
      this.updateStatus(
        "🎮 Ready! Punch forward, crouch down, hands together for hadouken!"
      );
    }
  }

  updateCooldowns() {
    const now = Date.now();
    Object.keys(this.cooldowns).forEach((key) => {
      if (this.cooldowns[key] > 0 && now >= this.cooldowns[key]) {
        this.cooldowns[key] = 0;
      }
    });
  }

  isOnCooldown(action) {
    return this.cooldowns[action] > 0;
  }

  setCooldown(action) {
    this.cooldowns[action] = Date.now() + this.cooldownTimes[action];
  }

  processPose(pose) {
    if (!this.baselinePose || pose.score < 0.25) return;

    const keypoints = pose.keypoints;
    const baseKeypoints = this.baselinePose.keypoints;

    const getKeypoint = (name) => {
      const point = keypoints.find((kp) => kp.name === name);
      const basePt = baseKeypoints.find((kp) => kp.name === name);
      const minConfidence = Math.min(this.confidenceThreshold, 0.5);
      return point &&
        basePt &&
        point.score > minConfidence &&
        basePt.score > minConfidence
        ? {
            current: point,
            baseline: basePt,
            confidence: Math.min(point.score, basePt.score),
          }
        : null;
    };

    const shoulders = {
      left: getKeypoint("left_shoulder"),
      right: getKeypoint("right_shoulder"),
    };

    const hips = {
      left: getKeypoint("left_hip"),
      right: getKeypoint("right_hip"),
    };

    const wrists = {
      left: getKeypoint("left_wrist"),
      right: getKeypoint("right_wrist"),
    };

    const knees = {
      left: getKeypoint("left_knee"),
      right: getKeypoint("right_knee"),
    };

    this.checkHadouken(wrists, hips);

    this.checkCrouch(knees, hips);

    this.checkSmartPunches(wrists, shoulders);
  }

  getSmartBodyCenter(shoulders, hips) {
    const points = [];
    const weights = [];

    if (shoulders.left) {
      points.push(shoulders.left.current);
      weights.push(shoulders.left.confidence * 1.2);
    }
    if (shoulders.right) {
      points.push(shoulders.right.current);
      weights.push(shoulders.right.confidence * 1.2);
    }
    if (hips.left) {
      points.push(hips.left.current);
      weights.push(hips.left.confidence);
    }
    if (hips.right) {
      points.push(hips.right.current);
      weights.push(hips.right.confidence);
    }

    if (points.length === 0) return null;

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const centerX =
      points.reduce((sum, point, i) => sum + point.x * weights[i], 0) /
      totalWeight;
    const centerY =
      points.reduce((sum, point, i) => sum + point.y * weights[i], 0) /
      totalWeight;

    return { x: centerX, y: centerY };
  }

  getBaselineBodyCenter(shoulders, hips) {
    const points = [];
    const weights = [];

    if (shoulders.left) {
      points.push(shoulders.left.baseline);
      weights.push(shoulders.left.confidence * 1.2);
    }
    if (shoulders.right) {
      points.push(shoulders.right.baseline);
      weights.push(shoulders.right.confidence * 1.2);
    }
    if (hips.left) {
      points.push(hips.left.baseline);
      weights.push(hips.left.confidence);
    }
    if (hips.right) {
      points.push(hips.right.baseline);
      weights.push(hips.right.confidence);
    }

    if (points.length === 0) return null;

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const centerX =
      points.reduce((sum, point, i) => sum + point.x * weights[i], 0) /
      totalWeight;
    const centerY =
      points.reduce((sum, point, i) => sum + point.y * weights[i], 0) /
      totalWeight;

    return { x: centerX, y: centerY };
  }

  getVelocity(keypoint) {
    if (this.poseHistory.length < 2) return 0;

    const recent = this.poseHistory[this.poseHistory.length - 1];
    const prev = this.poseHistory[this.poseHistory.length - 2];
    const timeDiff = (recent.timestamp - prev.timestamp) / 1000;

    const recentKp = recent.pose.keypoints.find((kp) => kp.name === keypoint);
    const prevKp = prev.pose.keypoints.find((kp) => kp.name === keypoint);

    if (
      !recentKp ||
      !prevKp ||
      recentKp.score < this.confidenceThreshold ||
      prevKp.score < this.confidenceThreshold
    ) {
      return 0;
    }

    const dx = recentKp.x - prevKp.x;
    const dy = recentKp.y - prevKp.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance / timeDiff;
  }

  checkCrouch(knees, hips) {
    if (this.isOnCooldown("crouch")) {
      return;
    }

    if (knees.left && knees.right && hips.left && hips.right) {
      const currentKneeY = (knees.left.current.y + knees.right.current.y) / 2;
      const currentHipY = (hips.left.current.y + hips.right.current.y) / 2;

      const baselineKneeY =
        (knees.left.baseline.y + knees.right.baseline.y) / 2;
      const baselineHipY = (hips.left.baseline.y + hips.right.baseline.y) / 2;

      const currentKneeHipDistance = Math.abs(currentKneeY - currentHipY);
      const baselineKneeHipDistance = Math.abs(baselineKneeY - baselineHipY);

      const kneeDropDistance = currentKneeY - baselineKneeY;

      const crouchThreshold = 0.8;
      const kneeDropThreshold = 0.05;

      const hasKneeHipDistanceChange =
        currentKneeHipDistance < baselineKneeHipDistance * crouchThreshold;
      const hasKneeDropped = kneeDropDistance > kneeDropThreshold;

      if (hasKneeHipDistanceChange || hasKneeDropped) {
        console.log(
          `⬇️ CROUCH detected! Knee-hip ratio: ${(
            currentKneeHipDistance / baselineKneeHipDistance
          ).toFixed(2)}, knee drop: ${kneeDropDistance.toFixed(3)}`
        );
        this.triggerKey("KeyS", false);
        this.setCooldown("crouch");
      }
    }
  }

  checkHadouken(wrists, hips) {
    if (!wrists.left || !wrists.right || this.isOnCooldown("hadouken")) {
      return;
    }

    let bellyY = null;
    if (hips.left && hips.right) {
      bellyY = (hips.left.current.y + hips.right.current.y) / 2 - 0.1;
    }

    const wristDistance = Math.sqrt(
      Math.pow(wrists.left.current.x - wrists.right.current.x, 2) +
        Math.pow(wrists.left.current.y - wrists.right.current.y, 2)
    );

    const avgHandX = (wrists.left.current.x + wrists.right.current.x) / 2;
    const avgHandY = (wrists.left.current.y + wrists.right.current.y) / 2;

    const maxHandDistance = 0.25;

    const handsAreTogether = wristDistance < maxHandDistance;

    let handsInBellyArea = true;
    if (bellyY !== null) {
      const bellyAreaRange = 0.15;
      handsInBellyArea = Math.abs(avgHandY - bellyY) < bellyAreaRange;
    }

    if (handsAreTogether && handsInBellyArea) {
      console.log(
        `🌀 HADOUKEN detected! Hand distance: ${wristDistance.toFixed(
          3
        )}, in belly area: ${handsInBellyArea}`
      );
      this.triggerKey("KeyE", false);
      this.setCooldown("hadouken");
    }
  }

  checkSmartPunches(wrists, shoulders) {
    if (this.isOnCooldown("punch")) {
      return;
    }

    if (wrists.left && shoulders.left) {
      const leftExtension = wrists.left.current.x - wrists.left.baseline.x;
      const shoulderMovement =
        shoulders.left.current.x - shoulders.left.baseline.x;
      const relativeExtension = leftExtension - shoulderMovement;

      const wristVelocity = this.getVelocity("left_wrist");
      const velocityBoost = Math.min(wristVelocity * 10, 0.05);

      const confidence = Math.min(
        wrists.left.confidence,
        shoulders.left.confidence
      );
      const baseThreshold = 0.15;
      const adjustedThreshold =
        baseThreshold - confidence * 0.05 - velocityBoost;

      if (relativeExtension > adjustedThreshold) {
        console.log(
          `👊 SMART LEFT PUNCH detected (ext: ${relativeExtension.toFixed(
            3
          )}, vel: ${wristVelocity.toFixed(3)})`
        );
        this.triggerKey("KeyQ", false);
        this.setCooldown("punch");
        return;
      }
    }

    if (wrists.right && shoulders.right) {
      const rightExtension = wrists.right.baseline.x - wrists.right.current.x;
      const shoulderMovement =
        shoulders.right.baseline.x - shoulders.right.current.x;
      const relativeExtension = rightExtension - shoulderMovement;

      const wristVelocity = this.getVelocity("right_wrist");
      const velocityBoost = Math.min(wristVelocity * 10, 0.05);

      const confidence = Math.min(
        wrists.right.confidence,
        shoulders.right.confidence
      );
      const baseThreshold = 0.15;
      const adjustedThreshold =
        baseThreshold - confidence * 0.05 - velocityBoost;

      if (relativeExtension > adjustedThreshold) {
        console.log(
          `👊 SMART RIGHT PUNCH detected (ext: ${relativeExtension.toFixed(
            3
          )}, vel: ${wristVelocity.toFixed(3)})`
        );
        this.triggerKey("KeyR", false);
        this.setCooldown("punch");
      }
    }
  }

  triggerKey(keyCode, isMovement) {
    if (!this.keyStates[keyCode]) {
      this.keyStates[keyCode] = true;
      this.dispatchKeyEvent("keydown", keyCode);
      console.log(`⚡ ACTION: ${keyCode}`);

      setTimeout(() => {
        if (this.keyStates[keyCode]) {
          this.keyStates[keyCode] = false;
          this.dispatchKeyEvent("keyup", keyCode);
        }
      }, 100);
    }
  }

  releaseAllKeys() {
    Object.keys(this.keyStates).forEach((key) => {
      if (this.keyStates[key]) {
        this.keyStates[key] = false;
        this.dispatchKeyEvent("keyup", key);
      }
    });
  }

  dispatchKeyEvent(type, code) {
    const event = new KeyboardEvent(type, {
      code: code,
      key: this.getKeyFromCode(code),
      bubbles: true,
      cancelable: true,
      which: this.getWhichCode(code),
      keyCode: this.getWhichCode(code),
    });

    document.dispatchEvent(event);

    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.dispatchEvent(event);
    }
  }

  getKeyFromCode(code) {
    const keyMap = {
      KeyA: "a",
      KeyD: "d",
      KeyW: "w",
      KeyS: "s",
      KeyQ: "q",
      KeyE: "e",
      KeyR: "r",
      KeyF: "f",
      KeyV: "v",
      KeyG: "g",
    };
    return keyMap[code] || code;
  }

  getWhichCode(code) {
    const whichMap = {
      KeyA: 65,
      KeyD: 68,
      KeyW: 87,
      KeyS: 83,
      KeyQ: 81,
      KeyE: 69,
      KeyR: 82,
      KeyF: 70,
      KeyV: 86,
      KeyG: 71,
    };
    return whichMap[code] || 0;
  }

  updateStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
    console.log("📋", message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("🌟 DOM loaded, creating MoveNet Controller...");
  const moveNetController = new MoveNetController();
  moveNetController.init();
});

export default MoveNetController;
