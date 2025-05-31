class MoveNetController {
  constructor() {
    this.detector = null;
    this.video = null;
    this.isRunning = false;
    this.keyStates = {};
    this.lastPose = null;
    this.movementThreshold = 0.1;
    this.confidenceThreshold = 0.5;
    this.frameSkip = 3; // Process every 3rd frame for better performance
    this.frameCount = 0;
  }

  async init() {
    console.log("🚀 Initializing MoveNet Controller...");

    try {
      // Setup overlay elements
      this.video = document.getElementById("movenet-video");
      this.startButton = document.getElementById("start-movenet-btn");
      this.statusElement = document.getElementById("movenet-status");

      console.log("📱 DOM elements found:", {
        video: !!this.video,
        button: !!this.startButton,
        status: !!this.statusElement,
      });

      // Add event listener for start button
      this.startButton.addEventListener("click", () => this.toggleMoveNet());

      // Load MoveNet model
      this.updateStatus("Loading MoveNet model...");
      console.log("🧠 Loading MoveNet model...");

      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
        minPoseScore: 0.25,
      };

      this.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );

      console.log("✅ MoveNet model loaded successfully!");
      this.updateStatus('Click "Start MoveNet" to begin body tracking');
      this.startButton.disabled = false;
    } catch (error) {
      console.error("❌ Error initializing MoveNet:", error);
      this.updateStatus("Error loading MoveNet. Please refresh the page.");
    }
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
    console.log("📷 Starting camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 200,
          height: 200,
          facingMode: "user",
        },
      });

      console.log("✅ Camera stream obtained:", stream);

      this.video.srcObject = stream;

      // Explicitly play the video and make it visible
      await this.video.play();
      this.video.style.display = "block";

      console.log("📺 Video element setup complete");

      this.isRunning = true;
      this.startButton.textContent = "Stop MoveNet";

      // Start pose detection immediately
      this.detectPoses();
      this.updateStatus("Body tracking active! Move to control the character.");

      console.log("🎯 Pose detection started");
    } catch (error) {
      console.error("❌ Error accessing camera:", error);
      this.updateStatus("Camera access denied. Please allow camera access.");
    }
  }

  stopCamera() {
    console.log("🛑 Stopping camera...");

    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((track) => {
        console.log("⏹️ Stopping track:", track.kind);
        track.stop();
      });
      this.video.srcObject = null;
    }

    this.video.style.display = "none";
    this.isRunning = false;
    this.startButton.textContent = "Start MoveNet";
    this.updateStatus('Body tracking stopped. Click "Start MoveNet" to begin.');

    // Release any held keys
    this.releaseAllKeys();
    console.log("✅ Camera stopped and keys released");
  }

  async detectPoses() {
    if (!this.isRunning || !this.detector) return;

    this.frameCount++;

    // Skip frames for better performance
    if (this.frameCount % this.frameSkip === 0) {
      try {
        const poses = await this.detector.estimatePoses(this.video);

        if (poses.length > 0) {
          console.log(
            `🎭 Pose detected! Score: ${poses[0].score.toFixed(
              3
            )}, Keypoints: ${poses[0].keypoints.length}`
          );
          this.processPose(poses[0]);
        } else {
          // Only log occasionally to avoid spam
          if (this.frameCount % 30 === 0) {
            console.log("👻 No poses detected in frame");
          }
        }
      } catch (error) {
        console.error("❌ Error detecting poses:", error);
      }
    }

    requestAnimationFrame(() => this.detectPoses());
  }

  processPose(pose) {
    if (pose.score < this.confidenceThreshold) {
      console.log(
        `🚫 Pose confidence too low: ${pose.score.toFixed(3)} < ${
          this.confidenceThreshold
        }`
      );
      return;
    }

    const keypoints = pose.keypoints;

    // Get key body parts with confidence check
    const getKeypoint = (name) => {
      const point = keypoints.find((kp) => kp.name === name);
      return point && point.score > this.confidenceThreshold ? point : null;
    };

    const leftWrist = getKeypoint("left_wrist");
    const rightWrist = getKeypoint("right_wrist");
    const leftShoulder = getKeypoint("left_shoulder");
    const rightShoulder = getKeypoint("right_shoulder");
    const leftHip = getKeypoint("left_hip");
    const rightHip = getKeypoint("right_hip");
    const leftKnee = getKeypoint("left_knee");
    const rightKnee = getKeypoint("right_knee");
    const nose = getKeypoint("nose");

    // Log detected body parts
    const detectedParts = {
      leftWrist: !!leftWrist,
      rightWrist: !!rightWrist,
      leftShoulder: !!leftShoulder,
      rightShoulder: !!rightShoulder,
      leftHip: !!leftHip,
      rightHip: !!rightHip,
      leftKnee: !!leftKnee,
      rightKnee: !!rightKnee,
      nose: !!nose,
    };

    console.log("🦴 Body parts detected:", detectedParts);

    this.checkMovements({
      leftWrist,
      rightWrist,
      leftShoulder,
      rightShoulder,
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
      nose,
    });

    this.lastPose = pose;
  }

  checkMovements(parts) {
    // Reset all movement keys
    this.releaseMovementKeys();

    if (
      !parts.leftShoulder ||
      !parts.rightShoulder ||
      !parts.leftHip ||
      !parts.rightHip
    ) {
      console.log("⚠️ Missing core body parts for movement detection");
      return;
    }

    // Calculate body center and dimensions
    const bodyCenter = {
      x:
        (parts.leftShoulder.x +
          parts.rightShoulder.x +
          parts.leftHip.x +
          parts.rightHip.x) /
        4,
      y:
        (parts.leftShoulder.y +
          parts.rightShoulder.y +
          parts.leftHip.y +
          parts.rightHip.y) /
        4,
    };

    const shoulderWidth = Math.abs(
      parts.rightShoulder.x - parts.leftShoulder.x
    );
    const bodyHeight = Math.abs(
      (parts.leftShoulder.y + parts.rightShoulder.y) / 2 -
        (parts.leftHip.y + parts.rightHip.y) / 2
    );

    console.log("📐 Body measurements:", {
      centerX: bodyCenter.x.toFixed(3),
      centerY: bodyCenter.y.toFixed(3),
      shoulderWidth: shoulderWidth.toFixed(3),
      bodyHeight: bodyHeight.toFixed(3),
    });

    // Check for lean left/right (body movement)
    if (bodyCenter.x < 0.4) {
      console.log("⬅️ LEAN LEFT detected");
      this.triggerKey("ArrowLeft", true);
    } else if (bodyCenter.x > 0.6) {
      console.log("➡️ LEAN RIGHT detected");
      this.triggerKey("ArrowRight", true);
    }

    // Check for crouch (body lowered)
    if (parts.nose && parts.nose.y > 0.6) {
      console.log("⬇️ CROUCH detected");
      this.triggerKey("ArrowDown", true);
    }

    // Check for jump (body raised or knees bent high)
    if (parts.leftKnee && parts.rightKnee) {
      const avgKneeY = (parts.leftKnee.y + parts.rightKnee.y) / 2;
      const avgHipY = (parts.leftHip.y + parts.rightHip.y) / 2;

      if (avgKneeY < avgHipY - bodyHeight * 0.2) {
        console.log("⬆️ JUMP detected");
        this.triggerKey("ArrowUp", true);
      }
    }

    // Check for punches (wrist position relative to shoulders)
    if (parts.leftWrist && parts.leftShoulder) {
      const leftPunchExtension = parts.leftWrist.x - parts.leftShoulder.x;
      if (Math.abs(leftPunchExtension) > shoulderWidth * 0.5) {
        if (parts.leftWrist.y < parts.leftShoulder.y - bodyHeight * 0.1) {
          console.log("👊 LEFT HIGH PUNCH detected");
          this.triggerKey("KeyR", false); // Heavy punch
        } else if (
          parts.leftWrist.y >
          parts.leftShoulder.y + bodyHeight * 0.1
        ) {
          console.log("👊 LEFT LOW PUNCH detected");
          this.triggerKey("KeyQ", false); // Light punch
        } else {
          console.log("👊 LEFT MID PUNCH detected");
          this.triggerKey("KeyE", false); // Medium punch
        }
      }
    }

    if (parts.rightWrist && parts.rightShoulder) {
      const rightPunchExtension = parts.rightShoulder.x - parts.rightWrist.x;
      if (Math.abs(rightPunchExtension) > shoulderWidth * 0.5) {
        if (parts.rightWrist.y < parts.rightShoulder.y - bodyHeight * 0.1) {
          console.log("👊 RIGHT HIGH PUNCH detected");
          this.triggerKey("KeyR", false); // Heavy punch
        } else if (
          parts.rightWrist.y >
          parts.rightShoulder.y + bodyHeight * 0.1
        ) {
          console.log("👊 RIGHT LOW PUNCH detected");
          this.triggerKey("KeyQ", false); // Light punch
        } else {
          console.log("👊 RIGHT MID PUNCH detected");
          this.triggerKey("KeyE", false); // Medium punch
        }
      }
    }

    // Check for kicks (knee raised)
    if (parts.leftKnee && parts.leftHip) {
      const leftKneeRaise = parts.leftHip.y - parts.leftKnee.y;
      if (leftKneeRaise > bodyHeight * 0.3) {
        if (parts.leftKnee.x < parts.leftHip.x - shoulderWidth * 0.2) {
          console.log("🦵 LEFT SIDE KICK detected");
          this.triggerKey("KeyG", false); // Heavy kick
        } else {
          console.log("🦵 LEFT FRONT KICK detected");
          this.triggerKey("KeyF", false); // Light kick
        }
      }
    }

    if (parts.rightKnee && parts.rightHip) {
      const rightKneeRaise = parts.rightHip.y - parts.rightKnee.y;
      if (rightKneeRaise > bodyHeight * 0.3) {
        if (parts.rightKnee.x > parts.rightHip.x + shoulderWidth * 0.2) {
          console.log("🦵 RIGHT SIDE KICK detected");
          this.triggerKey("KeyG", false); // Heavy kick
        } else {
          console.log("🦵 RIGHT FRONT KICK detected");
          this.triggerKey("KeyV", false); // Medium kick
        }
      }
    }
  }

  triggerKey(keyCode, isMovement) {
    // For movement keys, hold them down
    if (isMovement) {
      if (!this.keyStates[keyCode]) {
        this.keyStates[keyCode] = true;
        this.dispatchKeyEvent("keydown", keyCode);
        console.log(`🔥 MOVEMENT KEY PRESSED: ${keyCode}`);
      }
    } else {
      // For attack keys, trigger short press
      if (!this.keyStates[keyCode]) {
        this.keyStates[keyCode] = true;
        this.dispatchKeyEvent("keydown", keyCode);
        console.log(`⚡ ATTACK KEY PRESSED: ${keyCode}`);

        // Release after short delay
        setTimeout(() => {
          if (this.keyStates[keyCode]) {
            this.keyStates[keyCode] = false;
            this.dispatchKeyEvent("keyup", keyCode);
            console.log(`🔓 ATTACK KEY RELEASED: ${keyCode}`);
          }
        }, 100);
      }
    }
  }

  releaseMovementKeys() {
    const movementKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    movementKeys.forEach((key) => {
      if (this.keyStates[key]) {
        this.keyStates[key] = false;
        this.dispatchKeyEvent("keyup", key);
        console.log(`🔓 MOVEMENT KEY RELEASED: ${key}`);
      }
    });
  }

  releaseAllKeys() {
    Object.keys(this.keyStates).forEach((key) => {
      if (this.keyStates[key]) {
        this.keyStates[key] = false;
        this.dispatchKeyEvent("keyup", key);
        console.log(`🔓 ALL KEYS RELEASED: ${key}`);
      }
    });
  }

  dispatchKeyEvent(type, code) {
    const event = new KeyboardEvent(type, {
      code: code,
      key: this.getKeyFromCode(code),
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
  }

  getKeyFromCode(code) {
    const keyMap = {
      ArrowLeft: "ArrowLeft",
      ArrowRight: "ArrowRight",
      ArrowUp: "ArrowUp",
      ArrowDown: "ArrowDown",
      KeyQ: "q",
      KeyE: "e",
      KeyR: "r",
      KeyF: "f",
      KeyV: "v",
      KeyG: "g",
    };
    return keyMap[code] || code;
  }

  updateStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
    console.log("📋 Status update:", message);
  }
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("🌟 DOM loaded, creating MoveNet Controller...");
  const moveNetController = new MoveNetController();
  moveNetController.init();
});

export default MoveNetController;
