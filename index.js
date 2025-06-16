const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CONFIG))
});

const db = admin.firestore();
app.use(bodyParser.json());

// 사용자 등록 API
app.post("/register-user", async (req, res) => {
  const { userId, password, nickname } = req.body;

  if (!userId || !password || !nickname) {
    return res.status(400).send("Missing fields");
  }

  const userRef = db.collection("users").doc(userId);
  const doc = await userRef.get();

  if (doc.exists) {
    return res.status(409).send("User already exists");
  }

  await userRef.set({
    password,
    nickname,
    fcmToken: null  // 토큰은 나중에 따로 저장
  });

  res.status(200).send("User registered");
});

// 사용자 토큰 등록 API
app.post("/register-token", async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).send("Missing userId or token");
  }

  const userRef = db.collection("users").doc(userId);
  const doc = await userRef.get();

  if (!doc.exists) {
    return res.status(404).send("User not found");
  }

  await userRef.update({
    fcmToken: token
  });

  res.send("FCM token updated");
});

// 사용자 로그인 API
app.post("/login-user", async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).send("Missing fields");

  const userRef = db.collection("users").doc(userId);
  const doc = await userRef.get();

  if (!doc.exists) return res.status(404).send("User not found");

  const saved = doc.data();
  if (saved.password !== password) return res.status(401).send("Incorrect password");

  return res.status(200).send("Login successful");
});

// 푸시 알림 전송 API
app.post("/notify", async (req, res) => {
  console.log("📥 /notify 요청 수신:", req.body);
  const { fromUser, toUser, routineName } = req.body;

  if (!fromUser || !toUser || !routineName) {
    return res.status(400).send("Missing fields");
  }

  try {
    // 수신 대상의 FCM 토큰 조회
    const toUserRef = db.collection("users").doc(toUser);
    const toUserDoc = await toUserRef.get();

    if (!toUserDoc.exists) {
      return res.status(404).send("Target user not found");
    }

    const fcmToken = toUserDoc.data().fcmToken;
    if (!fcmToken) {
      return res.status(400).send("Target user has no FCM token");
    }

    // 발신자 닉네임도 Firestore에서 가져오기
    const fromUserRef = db.collection("users").doc(fromUser);
    const fromUserDoc = await fromUserRef.get();
    const senderNickname = fromUserDoc.exists ? fromUserDoc.data().nickname : fromUser;

    // 메시지 구성
    const message = {
      token: fcmToken,
      notification: {
        title: "루틴 알림",
        body: `${senderNickname} 님이 '${routineName}' 루틴을 시작했습니다!`
      },
      data: {
        fromUser,
        routineName
      }
    };

    // FCM 전송
    const response = await admin.messaging().send(message);
    console.log("✅ 푸시 전송 완료:", response);
    res.status(200).send("Notification sent");
  } catch (error) {
    console.error("❌ 푸시 전송 실패:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/", (req, res) => {
  res.send("✅ Routine FCM API 서버가 정상 작동 중입니다.");
});


app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
