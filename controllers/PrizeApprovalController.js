const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { db } = require("../configs/db");
const helpers = require("../helpers/helpers");
const { constants } = require("../configs/constants");
dotenv.config();

function formatDate(date, dateTime = true, delimiter = true) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  if (dateTime) {
    if (delimiter) {
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
  } else {
    return `${year}-${month}-${day}`;
  }
}

module.exports = {
  index: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 6, 9);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );

    return res.render("prizeApproval/index", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      csrfToken: req.csrfToken(),
      open: 6,
      active: 9,
      constants,
    });
  },
  showView: async function (req, res) {
    let template = req.body.template;
    let sql = "";
    let result;

    if (template == "wager") {
      sql = `SELECT DISTINCT DATE_FORMAT(CDate, '%Y-%m') AS dateResult FROM leaderboard_winner WHERE Category = 'Top Player' order by dateResult DESC, Rank ASC`;
      result = (await helpers.doQuery(db, sql)).results;
    } else if (template == "withdraw") {
      sql = `SELECT DISTINCT DATE_FORMAT(CDate, '%Y-%m') AS dateResult FROM leaderboard_winner WHERE Category = 'Top Withdraw' order by dateResult DESC, Rank ASC`;
      result = (await helpers.doQuery(db, sql)).results;
    } else if (template == "slot") {
      sql = `SELECT DISTINCT DATE_FORMAT(CDate, '%Y-%m') AS dateResult FROM leaderboard_winner WHERE Category = 'Top Game' AND Game_Category = 'Slot' order by dateResult DESC, Rank ASC`;
      result = (await helpers.doQuery(db, sql)).results;
    } else {
      sql = `SELECT DISTINCT DATE_FORMAT(CDate, '%Y-%m') AS dateResult FROM leaderboard_winner WHERE Category = 'Top Game' AND Game_Category = 'Casino' order by dateResult DESC, Rank ASC`;
      result = (await helpers.doQuery(db, sql)).results;
    }

    res.render(
      "prizeApproval/dataTables/" + template + "Table",
      { layout: false, csrfToken: req.csrfToken(), result },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  getDataWager: async function (req, res) {
    let loyalty = req.body.loyalty || "Bronze";
    let dateTran = req.body.bulan;

    let query = `SELECT A.*, COALESCE(B.Username,'SYS') AS Admin FROM leaderboard_winner A 
    LEFT JOIN admin B ON A.Last_User = B.ID 
    WHERE Loyalty = ? 
    AND Category = 'Top Player' 
    AND DATE_FORMAT(A.CDate, '%Y-%m') = ?`;
    let result = (await helpers.doQuery(db, query, [loyalty, dateTran]))
      .results;

    return res.json({
      data: result,
    });
  },
  getConfirmationWager: async function (req, res) {
    let id = req.body.id || "";
    let status = req.body.status || "";
    if (!id || !status) {
      return res.status(400).json({ error: "Invalid request" });
    }

    let data = (
      await helpers.doQuery(
        db,
        `SELECT * FROM leaderboard_winner WHERE ID = ?`,
        [id]
      )
    ).results;

    res.render(
      "prizeApproval/modals/confirmation",
      { layout: false, csrfToken: req.csrfToken(), status, data },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  approveTopWager: async function (req, res) {
    let id = req.body.id || "";
    let status = req.body.status || "";
    let remarks = req.body.remarks || "";
    let error = {};

    if (!id) {
      error.global = "Proses gagal, silahkan coba lagi";
    }

    checkData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM leaderboard_winner WHERE ID = ?`,
        [id]
      )
    ).results;

    if (checkData.length === 0) {
      error.global = "Data tidak ditemukan, silahkan coba lagi";
    }

    if (!status) {
      error.status = "Proses gagal, silahkan coba lagi";
    } else if (status !== "Approved" && status !== "Rejected") {
      error.status = "Status proses tidak sesuai, silahkan coba lagi";
    }

    if (status === "Rejected") {
      if (!remarks) {
        error.remarks = "Alasan penolakan harus diisi";
      }
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    if (status == "Approved") {
      let dataPlayer = (
        await helpers.doQuery(db, `SELECT * FROM user WHERE Username = ?`, [
          checkData[0]["Username"],
        ])
      ).results;
      if (dataPlayer.length > 0) {
        db.query(
          `UPDATE leaderboard_winner SET Process = 'Approved', Last_User = ?, Last_Date = ? WHERE ID = ?`,
          [req.session.ID, formatDate(new Date()), id],
          async function (err) {
            if (err) {
              console.error(err);
              return res.json({
                error: "Proses gagal, silahkan coba lagi",
              });
            }
            let codeTran = await helpers.generateTransactionID(
              "Top50",
              checkData[0]["Loyalty"]
            );

            let prizeCoin = Math.round(checkData[0]["Prize"]);
            let FinishCoin =
              parseFloat(dataPlayer[0]["Dompet_Koin"]) + parseFloat(prizeCoin);
            db.query(
              `INSERT INTO history_coin (Code, Username, DC, StartCoin, Coin, FinishCoin, Status, WebsiteID, CDate, Last_Date) VALUE (?, ?, 'Saldo Masuk', ?, ?, ?, 'Selesai', ?, NOW(), NOW())`,
              [
                codeTran,
                checkData[0]["Username"],
                dataPlayer[0]["Dompet_Koin"],
                prizeCoin,
                FinishCoin,
                process.env.websiteID,
              ],
              function (err) {
                if (err) {
                  console.error(err);
                  return res.json({
                    error: "Proses gagal, silahkan coba lagi",
                  });
                }
                db.query(
                  `INSERT INTO transaction_history (TransactionID,Username,WebsiteID,Date,Category,Status,Loyalty,Prize,CDate,Last_Date) VALUES(?, ?, ?, NOW(), 'Bonus', 'Selesai', ?, ?, NOW(), NOW())`,
                  [
                    codeTran,
                    checkData[0]["Username"],
                    process.env.websiteID,
                    checkData[0]["Loyalty"],
                    prizeCoin,
                  ],
                  function (err) {
                    if (err) {
                      console.error(err);
                    }
                    db.query(
                      `UPDATE user SET Dompet_Koin = ? WHERE Username = ?`,
                      [FinishCoin, checkData[0]["Username"]],
                      function (err) {
                        if (err) {
                          console.error(err);
                        }
                        db.query(
                          `INSERT INTO notification (Username, WebsiteID, NotificationHeader, NotificationDetail, ClaimableF, ClaimF, Date) VALUE (?, ?, ?, ?, 0, 0, NOW())`,
                          [
                            checkData[0].Username,
                            process.env.websiteID,
                            "Bonus Top Player Berhasil",
                            `Coin sebesar ${prizeCoin} berhasil ditambahkan`,
                          ],
                          function (err) {
                            if (err) {
                              console.error(err);
                            }

                            return res.json({ status: true });
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      } else {
        db.query(
          `UPDATE leaderboard_winner SET Process = 'Rejected', Remarks = 'Player Belum Terdaftar di Leaderboard', Last_User = ?, Last_Date = ? WHERE ID = ?`,
          [req.session.ID, formatDate(new Date()), id],
          async function (err) {
            if (err) {
              console.error(err);
            }
            return res.json({ status: true });
          }
        );
      }
    } else {
      db.query(
        `UPDATE leaderboard_winner SET Process = 'Rejected', Remarks = ?, Last_User = ?, Last_Date = ? WHERE ID = ?`,
        [remarks, req.session.ID, formatDate(new Date()), id],
        function (err) {
          if (err) {
            console.error(err);
          }
          return res.json({ status: true });
        }
      );
    }
  },
  getConfirmationAllWager: async function (req, res) {
    let loyalty = req.body.loyalty || "Bronze";
    let dateTran = req.body.dateTran;
    let status = req.body.status;

    let query = `SELECT COUNT(A.ID) AS TotalPlayer, SUM(A.Prize) AS TotalPrize FROM leaderboard_winner A WHERE Loyalty = ? AND Category = 'Top Player' AND DATE_FORMAT(A.CDate, '%Y-%m') = ?`;
    let result = (await helpers.doQuery(db, query, [loyalty, dateTran]))
      .results;

    res.render(
      "prizeApproval/modals/confirmationAll",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        loyalty,
        result,
        dateTran,
        status,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  approveAllTopWager: async function (req, res) {
    let status = req.body.status || "";
    let remarks = req.body.remarks || "";
    let error = {};

    if (!status) {
      error.status = "Proses gagal, silahkan coba lagi";
    } else if (status !== "Approved" && status !== "Rejected") {
      error.status = "Status proses tidak sesuai, silahkan coba lagi";
    }

    if (status === "Rejected") {
      if (!remarks) {
        error.remarks = "Alasan penolakan harus diisi";
      }
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    let loyalty = req.body.loyalty || "Bronze";
    let dateTran = req.body.dateTran;

    let query = `SELECT * FROM leaderboard_winner WHERE Loyalty = ? 
    AND Category = 'Top Player' 
    AND DATE_FORMAT(CDate, '%Y-%m') = ? 
    AND Process = 'Waiting'`;
    let queryValues = [loyalty, dateTran];
    let result = (await helpers.doQuery(db, query, queryValues)).results;

    await new Promise(async (resolve, reject) => {
      for (let i = 0; i < result.length; i++) {
        if (status === "Approved") {
          let username = result[i].Username;
          let queryUser = `SELECT * FROM user WHERE Username = ? AND WebsiteID = ?`;
          let valueUser = [username, process.env.websiteID];
          let user = (await helpers.doQuery(db, queryUser, valueUser)).results;
          if (user.length > 0) {
            db.query(
              `UPDATE leaderboard_winner SET Process = 'Approved', Last_User = ?, Last_Date = ? WHERE ID = ?`,
              [req.session.ID, formatDate(new Date()), result[i].ID],
              async function (err) {
                if (err) {
                  console.error(err);
                  return res.json({
                    error: "Proses gagal, silahkan coba lagi",
                  });
                }
                let codeTran = await helpers.generateTransactionID(
                  "Top50",
                  result[i]["Loyalty"]
                );
                let getPrize = (
                  await helpers.doQuery(
                    db,
                    `SELECT Prize FROM leaderboard_winner WHERE ID = ?`,
                    [result[i].ID]
                  )
                ).results;
                let prizeCoin = Math.round(getPrize[0]["Prize"]);
                let FinishCoin =
                  parseFloat(user[0]["Dompet_Koin"]) + parseFloat(prizeCoin);
                db.query(
                  `INSERT INTO history_coin (Code, Username, DC, StartCoin, Coin, FinishCoin, Status, WebsiteID, CDate, Last_Date) 
                  VALUE 
                  (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                  [
                    codeTran,
                    username,
                    "Saldo Masuk",
                    user[0]["Dompet_Koin"],
                    prizeCoin,
                    FinishCoin,
                    "Selesai",
                    process.env.websiteID,
                  ],
                  function (err) {
                    if (err) {
                      console.error(err);
                      return res.json({
                        error: "Proses gagal, silahkan coba lagi",
                      });
                    }
                    db.query(
                      `INSERT INTO transaction_history (TransactionID,Username,WebsiteID,Date,Category,Status,Loyalty,Prize,CDate,Last_Date) VALUES(?, ?, ?, NOW(), 'Bonus', 'Selesai', ?, ?, NOW(), NOW())`,
                      [
                        codeTran,
                        username,
                        process.env.websiteID,
                        result[i]["Loyalty"],
                        prizeCoin,
                      ],
                      function (err) {
                        if (err) {
                          console.error(err);
                        }
                        db.query(
                          `UPDATE user SET Dompet_Koin = ? WHERE Username = ?`,
                          [FinishCoin, username],
                          function (err) {
                            if (err) {
                              console.error(err);
                            }

                            db.query(
                              `INSERT INTO notification (Username, NotificationHeader, NotificationDetail, NotificationFooter, WebsiteID, Date) VALUES(?, ?, ?, ?, ?, ?)`,
                              [
                                username,
                                `Top Player ${result[i].Loyalty}`,
                                `Bonus Top Player ${result[i].Loyalty}`,
                                `Koin sebesar ${prizeCoin} telah ditambahkan ke dompet koin anda`,
                                process.env.websiteID,
                                formatDate(new Date()),
                              ],
                              function (err) {
                                if (err) {
                                  console.error(err);
                                }
                                resolve();
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          } else {
            db.query(
              `UPDATE leaderboard_winner SET Process = 'Rejected', Remarks = 'Player Belum Terdaftar di Leaderboard', Last_User = ?, Last_Date = ? WHERE ID = ?`,
              [req.session.ID, formatDate(new Date()), result[i].ID],
              async function (err) {
                if (err) {
                  console.error(err);
                }
                resolve();
              }
            );
          }
        } else {
          db.query(
            `UPDATE leaderboard_winner SET Process = 'Rejected', Remarks = ?, Last_User = ?, Last_Date = ? WHERE ID = ?`,
            [remarks, req.session.ID, formatDate(new Date()), result[i].ID],
            function (err) {
              if (err) {
                console.error(err);
              }
              resolve();
            }
          );
        }
      }
      return res.json({ status: true });
    });
  },
  getDataWithdraw: async function (req, res) {
    let dateTran = req.body.bulan;
    let query = `SELECT A.* FROM leaderboard_winner A WHERE Category = 'Top Withdraw' AND DATE_FORMAT(A.CDate, '%Y-%m') = ?`;
    let result = (await helpers.doQuery(db, query, [dateTran])).results;

    return res.json({
      data: result,
    });
  },
  getDataSlot: async function (req, res) {
    let dateTran = req.body.bulan;
    let query = `SELECT A.* FROM leaderboard_winner A WHERE Category = 'Top Game' AND Game_Category = 'Slot' AND DATE_FORMAT(A.CDate, '%Y-%m') = ?`;
    let result = (await helpers.doQuery(db, query, [dateTran])).results;

    return res.json({
      data: result,
    });
  },
  getDataCasino: async function (req, res) {
    let dateTran = req.body.bulan;
    let query = `SELECT A.* FROM leaderboard_winner A WHERE Category = 'Top Game' AND Game_Category = 'Casino' AND DATE_FORMAT(A.CDate, '%Y-%m') = ?`;

    let result = (await helpers.doQuery(db, query, [dateTran])).results;
    return res.json({
      data: result,
    });
  },
  checkPending: async function (req, res) {
    let loyalty = req.body.loyalty;
    let bulan = req.body.bulan;
    let query = `SELECT COUNT(*) as total FROM leaderboard_winner WHERE Process = 'Waiting' AND DATE_FORMAT(CDate, '%Y-%m') = ? AND Loyalty = ? AND Category = 'Top Player'`;
    let result = (await helpers.doQuery(db, query, [bulan, loyalty])).results;
    let pendingLoyalty = result[0].total;
    query = `SELECT COUNT(*) as total FROM leaderboard_winner WHERE Process = 'Waiting' AND DATE_FORMAT(CDate, '%Y-%m') = ? AND Category = 'Top Player'`;
    result = (await helpers.doQuery(db, query, [bulan])).results;
    let pendingAll = result[0].total;
    let data = {
      pendingLoyalty,
      pendingAll,
    };
    return res.json(data);
  },
};
