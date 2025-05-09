const express = require("express");
const router = express.Router();
const IndexController = require("../controllers/IndexController");
const AuthController = require("../controllers/AuthController");
const DailyRewardController = require("../controllers/DailyRewardController");
const SettingController = require("../controllers/SettingController");
const UploadController = require("../controllers/UploadController");
const AdminController = require("../controllers/AdminController");
const LuckyspinController = require("../controllers/LuckyspinController");
const LevelUpController = require("../controllers/LevelUpController");
const WithdrawController = require("../controllers/WithdrawController");
const PrizeLeaderboardController = require("../controllers/PrizeLeaderboardController");
const { uploadImage, uploadXlsx } = require("../configs/multer");
const PrizeApprovalController = require("../controllers/PrizeApprovalController");
const BannerController = require("../controllers/BannerController");
const WeeklyQuestController = require("../controllers/WeeklyQuestController");
const GatchaController = require("../controllers/GatchaController");
const multer = require("multer");
const crypto = require("crypto");
const RegisterPlayerController = require("../controllers/RegisterPlayerController");

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let bannerPathMobile = "public/uploads/banner/mobile/";
    let bannerPathDesktop = "public/uploads/banner/desktop/";
    if (req.session.ID) {
      let isImage = file.mimetype.startsWith("image/");
      if (isImage) {
        if (file.fieldname === "imageMobile") {
          cb(null, bannerPathMobile);
        } else if (file.fieldname === "imageBanner") {
          cb(null, bannerPathDesktop);
        } else {
          cb(new Error("Unknown fieldname"), false);
        }
      } else {
        cb(new Error("File is not an image"), false);
      }
    } else {
      cb(new Error("No session ID"), false);
    }
  },
  filename: function (req, file, cb) {
    const randomString = crypto.randomBytes(16).toString("hex");
    const fileExtension = file.originalname.split(".").pop();
    cb(null, `${randomString}.${fileExtension}`);
  },
});
var upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

router.get("/", IndexController.index);
router.post("/getDetailOTP", IndexController.getDetailOTP);
router.get("/login", AuthController.login);
router.post("/auth", AuthController.auth);
router.get("/logout", AuthController.logout);
router.post("/getPendingWD", IndexController.countPendingWD);
router.post("/getPendingWager", IndexController.checkWagerPending);

//change password
router.post("/getChangePassword", AuthController.getChangePassword);
router.post("/changePassword", AuthController.changePassword);

//routing page
router.get("/daily-rewards", DailyRewardController.index);
router.get("/upload-leaderboard", UploadController.index);
router.get("/settings", SettingController.index);
router.get("/admin", AdminController.index);
router.get("/luckyspin-prize", LuckyspinController.luckySpinPrize);
router.get("/luckyspin-coupon", LuckyspinController.luckySpinCoupon);

//admin
router.post("/checkEmail", AdminController.checkEmail);
router.post("/getDataAdmin", AdminController.getDataAdmin);
router.post("/getAddAdmin", AdminController.getAddAdmin);
router.post("/addAdmin", AdminController.addAdmin);
router.post("/getEditAdmin", AdminController.getEditAdmin);
router.post("/editAdmin", AdminController.editAdmin);
router.post("/getDeleteAdmin", AdminController.getDeleteAdmin);
router.post("/deleteAdmin", AdminController.deleteAdmin);
router.post("/getAccessAdmin", AdminController.getUserAccess);
router.post("/updateUserAccess", AdminController.updateUserAccess);

//luckyspin set prize
router.post("/getDataPrize", LuckyspinController.getDataPrize);
router.post("/getAddPrize", LuckyspinController.getAddPrize);
router.post("/addPrize", LuckyspinController.addPrize);
router.post("/getUpdatePrize", LuckyspinController.getUpdatePrize);
router.post("/updatePrize", LuckyspinController.updatePrize);
router.post("/getDeletePrize", LuckyspinController.getDeletePrize);
router.post("/deletePrize", LuckyspinController.deletePrize);

//set coupon
router.post("/getDataCoupon", LuckyspinController.getDataCoupon);
router.post("/getSetCoupon", LuckyspinController.getSetCoupon);
router.post("/checkPlayer", LuckyspinController.checkPlayer);
router.post("/setCoupon", LuckyspinController.setCoupon);
router.post("/getAddCoupon", LuckyspinController.getAddCoupon);
router.post("/addCoupon", LuckyspinController.addCoupon);
router.post("/getUpdateCoupon", LuckyspinController.getUpdateCoupon);
router.post("/updateCoupon", LuckyspinController.updateCoupon);
router.post("/getDeleteCoupon", LuckyspinController.getDeleteCoupon);
router.post("/deleteCoupon", LuckyspinController.deleteCoupon);
router.post("/populatePrizes", LuckyspinController.populatePrizes);

// uploads
router.post("/getDataTop50", UploadController.getDataTop50);
router.post("/dataTop50", UploadController.dataTop50);
router.post("/getDataTopSlot", UploadController.getDataTopSlot);
router.post("/dataTopSlot", UploadController.dataTopSlot);
router.post("/getDataTopCasino", UploadController.getDataTopCasino);
router.post("/dataTopCasino", UploadController.dataTopCasino);
router.post("/getDataTopWD", UploadController.getDataTopWD);
router.post("/dataTopWD", UploadController.dataTopWD);
router.get("/getDataTop200", UploadController.dataTop200);

//prize leaderboard
router.get("/prize_leaderboard", PrizeLeaderboardController.index);
router.post("/saveTop50TierPrize", PrizeLeaderboardController.saveTop50Tier);
router.post("/saveTop50WithdrawPrize", PrizeLeaderboardController.saveTop50WD);
router.post(
  "/saveTopCategoryPrize",
  PrizeLeaderboardController.saveTopCategory
);
router.post(
  "/saveLevelUpBonusPrize",
  PrizeLeaderboardController.saveLevelUpBonus
);

//setting
router.post(
  "/save-setting",
  uploadImage.single("image"),
  SettingController.saveSetting
);

//daily reward
router.post(
  "/getDataPeriodeDailyReward",
  DailyRewardController.getDataPeriodeDailyReward
);
router.post(
  "/getAddPeriodeDailyReward",
  DailyRewardController.getAddPeriodeDailyReward
);
router.post(
  "/addPeriodeDailyReward",
  DailyRewardController.addPeriodeDailyReward
);
router.post(
  "/getUpdatePeriodeDailyReward",
  DailyRewardController.getUpdatePeriodeDailyReward
);
router.post(
  "/updatePeriodeDailyReward",
  DailyRewardController.updatePeriodeDailyReward
);
router.post(
  "/getDeletePeriodeDailyReward",
  DailyRewardController.getDeletePeriodeDailyReward
);
router.post(
  "/deletePeriodeDailyReward",
  DailyRewardController.deletePeriodeDailyReward
);
router.post(
  "/getSetRewardDailyReward",
  DailyRewardController.getSetRewardDailyReward
);
router.post(
  "/setRewardDailyReward",
  DailyRewardController.setRewardDailyReward
);
router.post(
  "/getUpdateRewardDailyReward",
  DailyRewardController.getUpdateRewardDailyReward
);
router.post(
  "/updateRewardDailyReward",
  DailyRewardController.updateRewardDailyReward
);

// upload
router.post(
  "/upload-xslx-process-leads",
  uploadXlsx.single("xslx"),
  UploadController.uploadXslxLeadsProcess
);
router.post("/getUploadLeadsProcess", UploadController.getUploadLeadsProcess);
router.get("/getTemplate", UploadController.templateUpload);

// level up
router.get("/levelUp", LevelUpController.index);
router.post("/getLevelUp", LevelUpController.getDataLevelUp);
router.post("/approveLevelUp", LevelUpController.approvalLevelUp);
router.post("/approveAllLevelUp", LevelUpController.processAll);
router.post("/confirmationLevelUp", LevelUpController.getConfirmation);
router.post("/confirmationAllLevelUp", LevelUpController.getAllConfirmation);

// coin approval
router.get("/coin-approve", WithdrawController.index);
router.post("/getDataWithdraw", WithdrawController.getData);
router.post("/confirmationWithdraw", WithdrawController.getConfirmation);
router.post("/processWithdraw", WithdrawController.processingWithdraw);
router.post("/getCoinData", WithdrawController.getCoin);

// prize approval
router.get("/prize-approval", PrizeApprovalController.index);
router.post("/getView", PrizeApprovalController.showView);
router.post("/getWagerData", PrizeApprovalController.getDataWager);
router.post("/getConfirmWager", PrizeApprovalController.getConfirmationWager);
router.post("/getWithdrawData", PrizeApprovalController.getDataWithdraw);
router.post("/getSlotData", PrizeApprovalController.getDataSlot);
router.post("/getCasinowData", PrizeApprovalController.getDataCasino);
router.post("/approveTopWager", PrizeApprovalController.approveTopWager);
router.post(
  "/confirmationAllWager",
  PrizeApprovalController.getConfirmationAllWager
);
router.post("/approveAllWager", PrizeApprovalController.approveAllTopWager);
router.post("/countPending", PrizeApprovalController.checkPending);

router.get("/banner", BannerController.index);
router.post("/getDataBanner", BannerController.getDataBanner);
router.post("/getAddBanner", BannerController.getAddBanner);

router.post("/addBanner", upload.any(), BannerController.addBanner);
router.post("/updateStatusBanner", BannerController.updateStatusBanner);
router.post("/getDeleteBanner", BannerController.getDeleteBanner);
router.post("/deleteBanner", BannerController.deleteBanner);

router.get("/gatcha", GatchaController.index);
router.post("/getDataGatcha", GatchaController.getData);
router.post("/getNewGatcha", GatchaController.getNew);
router.post("/newGatcha", GatchaController.newGatcha);

router.get("/weekly-quest", WeeklyQuestController.index);
router.post("/getDataQuest", WeeklyQuestController.getData);
router.post("/getMaxQuest", WeeklyQuestController.getFormMax);
router.post("/updateMaxQuest", WeeklyQuestController.updateMaxQuest);
router.post("/getNewQuest", WeeklyQuestController.getNew);
router.post("/newQuestWebsite", WeeklyQuestController.newQuest);
router.post("/getUpdateQuest", WeeklyQuestController.getFormConfirmation);
router.post("/approveQuest", WeeklyQuestController.confirmQuest);

router.get("/regis_player", RegisterPlayerController.index);
router.post("/getDataPlayer", RegisterPlayerController.getDataPlayer);
router.post("/getNewRegister", RegisterPlayerController.getFromNew);
router.post("/checkUsername", RegisterPlayerController.checkUsername);
router.post("/addPlayer", RegisterPlayerController.addPlayer);
router.post("/getResetPlayer", RegisterPlayerController.getResetPassword);
router.post("/editPasswordPlayer", RegisterPlayerController.resetPassword);

module.exports = router;
