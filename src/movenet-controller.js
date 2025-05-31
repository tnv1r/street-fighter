class MoveNetController {
  constructor() {
    this.detector = null;
    this.video = null;
    this.isRunning = false;
    this.keyStates = {};
    this.lastPose = null;
    this.confidenceThreshold = 0.6; // Increased for better accuracy
    this.frameSkip = 2; // Process every 2nd frame
    this.frameCount = 0;

    // Cooldown system - reduced for better responsiveness
    this.cooldowns = {
      movement: 0,
      punch: 0,
      kick: 0,
      hadouken: 0,
    };

    this.cooldownTimes = {
      movement: 150, // Slightly longer for movement
      punch: 800, // Increased cooldown to prevent spam detection
      kick: 500,
      hadouken: 3000,
    };

    // Baseline pose for relative movement detection
    this.baselinePose = null;
    this.baselineFrames = 0;
    this.needsBaseline = true;
  }

  async init() {
    console.log("🚀 Initializing MoveNet Controller for Player 1...");
    console.log("🎮 SIMPLIFIED MOVEMENT GUIDE:");
    console.log("📍 BODY MOVEMENTS:");
    console.log("   • Lean LEFT (shift body weight left)");
    console.log("   • Lean RIGHT (shift body weight right)");
    console.log("   • CROUCH (bend knees/lower body)");
    console.log("   • JUMP (raise knees up)");
    console.log("🥊 ATTACKS:");
    console.log("   • PUNCH: Extend arm forward");
    console.log("   • KICK: Raise knee high");
    console.log("💡 TIP: Stand centered, then move deliberately!");

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
        minPoseScore: 0.3,
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

      console.log("✅ Camera stream obtained");

      this.video.srcObject = stream;
      await this.video.play();
      this.video.style.display = "block";

      this.isRunning = true;
      this.needsBaseline = true;
      this.baselineFrames = 0;
      this.startButton.textContent = "Stop MoveNet";

      // Start pose detection
      this.detectPoses();
      this.updateStatus(
        "🎯 Stand centered and still for 2 seconds to calibrate..."
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
    this.isRunning = false;
    this.needsBaseline = true;
    this.startButton.textContent = "Start MoveNet";
    this.updateStatus('Body tracking stopped. Click "Start MoveNet" to begin.');

    // Release any held keys
    this.releaseAllKeys();
    console.log("✅ Camera stopped and keys released");
  }

  async detectPoses() {
    if (!this.isRunning || !this.detector) return;

    this.frameCount++;

    // Update cooldowns
    this.updateCooldowns();

    // Skip frames for better performance
    if (this.frameCount % this.frameSkip === 0) {
      try {
        const poses = await this.detector.estimatePoses(this.video);

        if (poses.length > 0 && poses[0].score > 0.3) {
          if (this.needsBaseline) {
            this.establishBaseline(poses[0]);
          } else {
            this.processPose(poses[0]);
          }
        }
      } catch (error) {
        console.error("❌ Error detecting poses:", error);
      }
    }

    requestAnimationFrame(() => this.detectPoses());
  }

  establishBaseline(pose) {
    this.baselineFrames++;

    if (this.baselineFrames === 1) {
      this.baselinePose = pose;
      console.log("📏 Starting baseline calibration...");
    } else if (this.baselineFrames < 60) {
      // 2 seconds at 30fps
      // Average the baseline pose
      const alpha = 0.1; // Smoothing factor
      pose.keypoints.forEach((kp, i) => {
        if (kp.score > this.confidenceThreshold) {
          this.baselinePose.keypoints[i].x =
            this.baselinePose.keypoints[i].x * (1 - alpha) + kp.x * alpha;
          this.baselinePose.keypoints[i].y =
            this.baselinePose.keypoints[i].y * (1 - alpha) + kp.y * alpha;
        }
      });
    } else {
      this.needsBaseline = false;
      console.log("✅ Baseline established! Ready for movement detection");
      this.updateStatus("🎮 Ready! Start moving to control Player 1");
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
    if (!this.baselinePose || pose.score < 0.3) return;

    const keypoints = pose.keypoints;
    const baseKeypoints = this.baselinePose.keypoints;

    // Get reliable keypoints
    const getKeypoint = (name) => {
      const point = keypoints.find((kp) => kp.name === name);
      const basePt = baseKeypoints.find((kp) => kp.name === name);
      return point && basePt && point.score > this.confidenceThreshold
        ? { current: point, baseline: basePt }
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

    this.checkMovements(shoulders, hips, wrists, knees);
  }

  checkMovements(shoulders, hips, wrists, knees) {
    // Release movement keys if not on cooldown
    if (!this.isOnCooldown("movement")) {
      this.releaseMovementKeys();
    }

    // Need at least shoulders and hips for body movement
    if (!shoulders.left || !shoulders.right || !hips.left || !hips.right) {
      return;
    }

    // Calculate body center movement
    const currentBodyX =
      (shoulders.left.current.x +
        shoulders.right.current.x +
        hips.left.current.x +
        hips.right.current.x) /
      4;
    const baselineBodyX =
      (shoulders.left.baseline.x +
        shoulders.right.baseline.x +
        hips.left.baseline.x +
        hips.right.baseline.x) /
      4;

    const currentBodyY =
      (shoulders.left.current.y +
        shoulders.right.current.y +
        hips.left.current.y +
        hips.right.current.y) /
      4;
    const baselineBodyY =
      (shoulders.left.baseline.y +
        shoulders.right.baseline.y +
        hips.left.baseline.y +
        hips.right.baseline.y) /
      4;

    const bodyXDiff = currentBodyX - baselineBodyX;
    const bodyYDiff = currentBodyY - baselineBodyY;

    const moveThreshold = 0.08; // 8% of frame width/height

    // Movement detection with cooldown
    if (!this.isOnCooldown("movement")) {
      if (bodyXDiff < -moveThreshold) {
        console.log("⬅️ LEAN LEFT detected");
        this.triggerKey("KeyA", true);
        this.setCooldown("movement");
      } else if (bodyXDiff > moveThreshold) {
        console.log("➡️ LEAN RIGHT detected");
        this.triggerKey("KeyD", true);
        this.setCooldown("movement");
      } else if (bodyYDiff > moveThreshold * 0.6) {
        console.log("⬇️ CROUCH detected");
        this.triggerKey("KeyS", true);
        this.setCooldown("movement");
      }

      // Jump detection (knees raised)
      if (knees.left && knees.right) {
        const leftKneeRaise = knees.left.baseline.y - knees.left.current.y;
        const rightKneeRaise = knees.right.baseline.y - knees.right.current.y;

        if (leftKneeRaise > 0.15 || rightKneeRaise > 0.15) {
          console.log("⬆️ JUMP detected");
          this.triggerKey("KeyW", true);
          this.setCooldown("movement");
        }
      }
    }

    // Attack detection
    this.checkAttacks(wrists, shoulders, knees, hips);
  }

  checkAttacks(wrists, shoulders, knees, hips) {
    // Punch detection - increased threshold for more deliberate punches
    if (!this.isOnCooldown("punch") && wrists.left && shoulders.left) {
      const leftPunchExtension = wrists.left.current.x - wrists.left.baseline.x;
      if (Math.abs(leftPunchExtension) > 0.18) {
        // Increased threshold
        console.log("👊 LEFT PUNCH detected - Light punch (Q)");
        this.triggerKey("KeyQ", false); // Light punch for left hand
        this.setCooldown("punch");
      }
    }

    if (!this.isOnCooldown("punch") && wrists.right && shoulders.right) {
      const rightPunchExtension =
        wrists.right.baseline.x - wrists.right.current.x;
      if (Math.abs(rightPunchExtension) > 0.18) {
        // Increased threshold
        console.log("👊 RIGHT PUNCH detected - Heavy punch (R)");
        this.triggerKey("KeyR", false); // Heavy punch for right hand
        this.setCooldown("punch");
      }
    }

    // Kick detection (simplified)
    if (!this.isOnCooldown("kick")) {
      if (knees.left && hips.left) {
        const leftKneeRaise = knees.left.baseline.y - knees.left.current.y;
        if (leftKneeRaise > 0.2) {
          console.log("🦵 LEFT KICK detected");
          this.triggerKey("KeyF", false);
          this.setCooldown("kick");
        }
      }

      if (knees.right && hips.right) {
        const rightKneeRaise = knees.right.baseline.y - knees.right.current.y;
        if (rightKneeRaise > 0.2) {
          console.log("🦵 RIGHT KICK detected");
          this.triggerKey("KeyG", false);
          this.setCooldown("kick");
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
        console.log(`🔥 MOVEMENT: ${keyCode}`);
      }
    } else {
      // For attack keys, trigger short press
      if (!this.keyStates[keyCode]) {
        this.keyStates[keyCode] = true;
        this.dispatchKeyEvent("keydown", keyCode);
        console.log(`⚡ ATTACK: ${keyCode}`);

        // Release after short delay
        setTimeout(() => {
          if (this.keyStates[keyCode]) {
            this.keyStates[keyCode] = false;
            this.dispatchKeyEvent("keyup", keyCode);
          }
        }, 100);
      }
    }
  }

  releaseMovementKeys() {
    const movementKeys = ["KeyA", "KeyD", "KeyW", "KeyS"];
    movementKeys.forEach((key) => {
      if (this.keyStates[key]) {
        this.keyStates[key] = false;
        this.dispatchKeyEvent("keyup", key);
      }
    });
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
      // Ensure it targets Player 1 specifically
      which: this.getWhichCode(code),
      keyCode: this.getWhichCode(code),
    });

    // Dispatch to document for Player 1 controls
    document.dispatchEvent(event);

    // Also try dispatching to the game canvas if it exists
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

// Initialize when page loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("🌟 DOM loaded, creating MoveNet Controller...");
  const moveNetController = new MoveNetController();
  moveNetController.init();
});

export default MoveNetController;
