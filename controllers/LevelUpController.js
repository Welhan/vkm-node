const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { db } = require("../configs/db");
const helpers = require("../helpers/helpers");
const { constants } = require("../configs/constants");
const { stat } = require("fs");
const { start } = require("repl");
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
      return res.redirect("/login");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 0, 11);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    return res.render("level/levelUp", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      active: 0,
      open: 0,
      csrfToken: req.csrfToken(),
      constants,
    });
  },
  getDataLevelUp: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let status = req.body.status || "";
    let startDate = req.body.startDate
      ? req.body.startDate.split("/").reverse().join("-")
      : null;
    let endDate = req.body.endDate
      ? req.body.endDate.split("/").reverse().join("-")
      : null;

    let queryLevelUp = `SELECT A.ID, A.Username, A.CurrentLevel, A.LevelUpTo, A.Prize, A.ApprovalStatus, A.Remarks, B.Username AS Admin 
      FROM levelup_history A 
      LEFT JOIN admin B ON A.ApprovedBy = B.ID 
      WHERE 1=1`;
    if (startDate && endDate) {
      queryLevelUp += ` AND A.CDate BETWEEN '${startDate} 00:00:00' AND '${endDate} 23:59:59'`;
    } else if (startDate) {
      queryLevelUp += ` AND A.CDate >= '${startDate} 00:00:00'`;
    } else if (endDate) {
      queryLevelUp += ` AND A.CDate <= '${endDate} 23:59:59'`;
    }
    queryLevelUp += ` AND A.WebsiteID = ${process.env.websiteID}`;
    if (status) {
      queryLevelUp += ` AND A.ApprovalStatus = '${status}'`;
    }
    let getDataLevelUp = (await helpers.doQuery(db, queryLevelUp)).results;
    return res.json({
      data: getDataLevelUp,
    });
  },
  approvalLevelUp: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }

    let id = req.body.id || "";
    let approval = req.body.status || "";
    let remarks = req.body.remarks || "";
    let error = {};

    if (!id) {
      error.id = "Proses approval gagal (id ga ad)";
    }

    if (!approval) {
      error.global = "Proses approval gagal (status kosong)";
    } else {
      if (approval != "Approved" && approval != "Rejected") {
        error.global = "Proses approval gagal (status salah)";
      }
    }

    if (approval === "Rejected") {
      if (!remarks) {
        error.remarks = "Alasan penolakan harus diisi";
      }
    }
    checkStatus = (
      await helpers.doQuery(
        db,
        `SELECT * FROM levelup_history WHERE ID = ? AND WebsiteID = ?`,
        [id, process.env.websiteID]
      )
    ).results;

    if (checkStatus.length > 0) {
      if (checkStatus[0].ApprovalStatus !== "Pending") {
        error.global = "Proses approval gagal (sudah diproses)";
      }
    } else {
      error.global = "Proses approval gagal (data tidak ditemukan)";
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    let username = (
      await helpers.doQuery(
        db,
        `SELECT Username FROM levelup_history WHERE ID =? AND WebsiteID = ?`,
        [id, process.env.websiteID]
      )
    ).results[0].Username;

    let user = (
      await helpers.doQuery(
        db,
        `SELECT * FROM user WHERE Username = ? AND WebsiteID = ?`,
        [username, process.env.websiteID]
      )
    ).results[0];

    if (approval === "Approved") {
      db.query(
        `Update levelup_history set ApprovalStatus = ?, ApprovedBy = ?, LastDate = ? WHERE ID = ?`,
        ["Approved", req.session.ID, formatDate(new Date()), id],
        async function (err) {
          if (err) {
            console.error(err);
          }
          let historyCoinQuery = `SELECT * FROM user WHERE Username = ? AND WebsiteID = ?`;
          let historyCoinValue = [username, process.env.websiteID];
          let historyCoin = (
            await helpers.doQuery(db, historyCoinQuery, historyCoinValue)
          ).results;
          db.query(
            `Update user set Dompet_Koin = ? WHERE Username = ? AND WebsiteID = ?`,
            [
              Number(user.Dompet_Koin) + Number(checkStatus[0].Prize),
              username,
              process.env.websiteID,
            ],
            async function (err) {
              if (err) {
                console.error(err);
              }
              let StartCoin = historyCoin[0].Dompet_Koin;
              let Coin = checkStatus[0].Prize;
              let FinishCoin = Number(StartCoin) + Number(Coin);
              let codeTran = await helpers.generateTransactionID(
                "LevelUp",
                checkStatus[0].LevelUpTo
              );
              let query = `INSERT INTO history_coin (Code, Username, DC, StartCoin, Coin, FinishCoin, Status, WebsiteID, CDate, Last_Date) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
              let valueQuery = [
                codeTran,
                username,
                "Saldo Masuk",
                StartCoin,
                Coin,
                FinishCoin,
                "Selesai",
                process.env.websiteID,
                formatDate(new Date()),
                formatDate(new Date()),
              ];
              db.query(query, valueQuery, async function (err) {
                if (err) {
                  return console.log(err);
                }
                let getNotification = await helpers.getConfigNotification(
                  "Level Up"
                );
                let NotificationHeader = getNotification.Header;
                let NotificationDetail = getNotification.Detail;
                let NotificationFooter = getNotification.Footer;
                let newLoyalty = checkStatus[0].LevelUpTo;
                let Header0 = NotificationHeader.split("%s%")[0];
                let Detail0 = NotificationDetail.split("%s%")[0];
                let Detail1 = NotificationDetail.split("%s%")[1];
                NotificationHeader = Header0 + newLoyalty;
                NotificationDetail = Detail0 + checkStatus[0].Prize + Detail1;
                db.query(
                  `INSERT INTO notification (Username, NotificationHeader, NotificationDetail, NotificationFooter, WebsiteID, Date) 
                  VALUES(?, ?, ?, ?, ?, ?)`,
                  [
                    username,
                    NotificationHeader,
                    NotificationDetail,
                    NotificationFooter,
                    process.env.websiteID,
                    formatDate(new Date()),
                  ],
                  function (err) {
                    if (err) {
                      console.error(err);
                    }

                    return res.json({ status: true });
                  }
                );
              });
            }
          );
        }
      );
    } else {
      db.query(
        `Update levelup_history set ApprovalStatus = ?, ApprovedBy = ?, Remarks = ?, LastDate = ? WHERE ID = ?`,
        ["Rejected", req.session.ID, remarks, formatDate(new Date()), id],
        function (err) {
          if (err) {
            console.error(err);
          }
          return res.json({ status: true });
        }
      );
    }
  },
  processAll: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let startDate = req.body.startDate
      ? req.body.startDate.split("/").reverse().join("-")
      : new Date().toISOString().split("T")[0];
    let endDate = req.body.endDate
      ? req.body.endDate.split("/").reverse().join("-")
      : "";
    let status = req.body.status;
    let remarks = req.body.remarks;
    let error = {};

    if (status === "Rejected") {
      if (!remarks) {
        error.remarks = "Alasan penolakan harus diisi";
      }
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM levelup_history WHERE CDate BETWEEN ? AND ? AND ApprovalStatus = 'Pending' AND WebsiteID = ?`,
        [
          `${startDate} 00:00:00`,
          `${endDate ? endDate : startDate} 23:59:59`,
          process.env.websiteID,
        ]
      )
    ).results;

    if (getData.length > 0) {
      await new Promise(async (resolve, reject) => {
        for (let i = 0; i < getData.length; i++) {
          if (status === "Approved") {
            let username = getData[i].Username;
            let user = (
              await helpers.doQuery(
                db,
                `SELECT * FROM user WHERE Username = ? AND WebsiteID = ?`,
                [username, process.env.websiteID]
              )
            ).results[0];
            db.query(
              `Update levelup_history set ApprovalStatus = ?, ApprovedBy = ?, LastDate = ? WHERE ID = ?`,
              [
                "Approved",
                req.session.ID,
                formatDate(new Date()),
                getData[i].ID,
              ],
              async function (err) {
                if (err) {
                  console.error(err);
                }
                let StartCoin = user.Dompet_Koin;
                let Coin = getData[i].Prize;
                let FinishCoin = Number(StartCoin) + Number(Coin);
                let codeTran = await helpers.generateTransactionID(
                  "LevelUp",
                  getData[i]["LevelUpTo"]
                );
                // bungkus dengan db query insert ke transaction_history
                db.query(
                  `Update user set Dompet_Koin = ? WHERE Username = ? AND WebsiteID = ?`,
                  [FinishCoin, username, process.env.websiteID],
                  function (err) {
                    if (err) {
                      console.error(err);
                    }
                    let query = `INSERT INTO history_coin (Code, Username, DC, StartCoin, Coin, FinishCoin, Status, WebsiteID, CDate, Last_Date) VALUES(?,?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    let valueQuery = [
                      codeTran,
                      username,
                      "Saldo Masuk",
                      StartCoin,
                      Coin,
                      FinishCoin,
                      "Selesai",
                      process.env.websiteID,
                      formatDate(new Date()),
                      formatDate(new Date()),
                    ];
                    db.query(query, valueQuery, async function (err) {
                      if (err) {
                        console.log(err);
                      }
                      let getNotification = await helpers.getConfigNotification(
                        "Level Up"
                      );
                      let NotificationHeader = getNotification.Header;
                      let NotificationDetail = getNotification.Detail;
                      let NotificationFooter = getNotification.Footer;
                      let newLoyalty = getData[0].LevelUpTo;
                      let Header0 = NotificationHeader.split("%s%")[0];
                      let Detail0 = NotificationDetail.split("%s%")[0];
                      let Detail1 = NotificationDetail.split("%s%")[1];
                      NotificationHeader = Header0 + newLoyalty;
                      NotificationDetail = Detail0 + getData[0].Prize + Detail1;
                      db.query(
                        `INSERT INTO notification (Username, NotificationHeader, NotificationDetail, NotificationFooter, WebsiteID, Date) 
                  VALUES(?, ?, ?, ?, ?, ?)`,
                        [
                          username,
                          NotificationHeader,
                          NotificationDetail,
                          NotificationFooter,
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
                    });
                  }
                );
              }
            );
          } else {
            db.query(
              `Update levelup_history set ApprovalStatus = ?, Remarks = ?, ApprovedBy = ?, LastDate = ? WHERE ID = ?`,
              [
                "Rejected",
                remarks,
                req.session.ID,
                formatDate(new Date()),
                getData[i].ID,
              ],
              function (err) {
                if (err) {
                  console.error(err);
                }
                resolve();
              }
            );
          }
        }
      });
      return res.json({ status: true });
    } else {
      return res.json({ error: "Tidak ada data yang bisa diproses" });
    }
  },
  getConfirmation: async function (req, res) {
    let id = req.body.id || "";
    let status = req.body.status || "";
    if (!id || !status) {
      return res.status(400).json({ error: "Invalid request" });
    }

    let data = (
      await helpers.doQuery(db, `SELECT * FROM levelup_history WHERE ID = ?`, [
        id,
      ])
    ).results;

    res.render(
      "level/modals/confirmation",
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
  getAllConfirmation: async function (req, res) {
    let startDate = req.body.startDate
      ? req.body.startDate.split("/").reverse().join("-")
      : new Date().toISOString().split("T")[0];
    let endDate = req.body.endDate
      ? req.body.endDate.split("/").reverse().join("-")
      : "";
    let status = req.body.status;

    let data = (
      await helpers.doQuery(
        db,
        `SELECT COUNT(A.ID) AS TotalPlayer, SUM(A.Prize) AS TotalPrize FROM levelup_history A WHERE 1 AND ApprovalStatus = 'Pending' ${
          startDate && endDate
            ? "AND A.CDate BETWEEN ? AND ?"
            : startDate
            ? "AND A.CDate BETWEEN ? AND ?"
            : endDate
            ? "AND A.CDate BETWEEN ? AND ?"
            : ""
        } AND A.WebsiteID = ? ORDER BY A.ID DESC`,
        [
          ...(startDate && endDate
            ? [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
            : startDate
            ? [`${startDate} 00:00:00`, `${startDate} 23:59:59`]
            : endDate
            ? [`${endDate} 00:00:00`, `${endDate} 23:59:59`]
            : []),
          process.env.websiteID,
        ]
      )
    ).results;

    res.render(
      "level/modals/confirmationAll",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        status,
        data,
        startDate,
        endDate,
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
};
