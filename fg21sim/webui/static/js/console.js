/**
 * Copyright (c) 2016 Weitian LI <liweitianux@live.com>
 * MIT license
 *
 * Web UI of "fg21sim"
 * Console operations using the WebSocket communications
 */

"use strict";


/**
 * Update the task status "#task-status" on the page.
 *
 * @param {Object} status - The status pushed from the server is an object
 *                          containing the "running" and "finished" items.
 */
var updateTaskStatus = function (status) {
  var running = status.running;
  var finished = status.finished;
  var ts;
  if (!running && !finished) {
    ts = "Not started";
    $("#task-status").removeClass("label-success label-warning label-danger")
      .addClass("label-default");
    $("#task-status .icon").removeClass("fa-check-circle fa-question-circle")
      .removeClass("fa-cog fa-spinner")
      .addClass("fa-coffee");
  }
  else if (!running && finished) {
    ts = "Finished";
    $("#task-status").removeClass("label-default label-warning label-danger")
      .addClass("label-success");
    $("#task-status .icon").removeClass("fa-coffee fa-question-circle")
      .removeClass("fa-cog fa-spinner")
      .addClass("fa-check-circle");
  }
  else if (running && !finished) {
    ts = "Running";
    $("#task-status").removeClass("label-default label-success label-danger")
      .addClass("label-warning");
    $("#task-status .icon").removeClass("fa-coffee fa-check-circle")
      .removeClass("fa-question-circle")
      .addClass("fa-cog fa-spinner");
  }
  else {
    // Unknown status: ERROR ??
    ts = "ERROR?";
    $("#task-status").removeClass("label-default label-success label-warning")
      .addClass("label-danger");
    $("#task-status .icon").removeClass("fa-coffee fa-check-circle")
      .removeClass("fa-cog fa-spinner")
      .addClass("fa-question-circle");
  }
  console.log("Task status:", ts);
  $("#task-status .text").text(ts);
};


/**
 * Append the logging messages to the "#log-messages" panel box
 *
 * @param {Object} msg - Server pushed logging message
 */
var appendLogMessage = function (msg) {
  var log_icons = {
    debug: "<span class='icon fa fa-comment'></span>",
    info: "<span class='icon fa fa-info-circle'></span>",
    warning: "<span class='icon fa fa-warning'></span>",
    error: "<span class='icon fa fa-times-circle'></span>",
    critical: "<span class='icon fa fa-times-circle'></span>"
  };
  var level = msg.levelname.toLowerCase();
  var ele = $("<p>").addClass("code log log-" + level);
  ele.append($(log_icons[level]));
  ele.append($("<span>").addClass("asctime").text(msg.asctime));
  ele.append($("<span>").addClass("levelname")
             .text("[" + msg.levelname + "]"));
  ele.append($("<span>").addClass("name").text("<" + msg.name + ">"));
  ele.append($("<span>").addClass("message").text(msg.message));
  ele.appendTo("#log-messages");
};


/**
 * Toggle the display of the logging messages at the given level.
 *
 * NOTE:
 * Use a data attribute to keep the current toggle state to be more robust.
 *
 * @param {String} level - Which level of logging messages to be toggled?
 *                         Valid: debug, info, warning, error, critical
 */
var toggleLogMessages = function (level) {
  var valid_levels = ["debug", "info", "warning", "error", "critical"];
  var status, logbox;
  if (! level) {
    console.error("toggleLogMessages: level not specified");
  } else if ($.inArray(level.toLowerCase(), valid_levels) == -1) {
    console.error("toggleLogMessages: invalid level:", level);
  } else {
    level = level.toLowerCase();
    logbox = $("#log-messages");
    if (typeof logbox.data(level) === "undefined") {
      // No stored display status, assuming true: show
      status = true;
      logbox.data(level, status);
    } else {
      // Use the stored display status
      status = logbox.data(level);
    }
    // Toggle the display status
    status = !status;
    logbox.find("p.log-" + level).toggle();
    // Save the new display status
    logbox.data(level, status);
    console.log("Toggled", level, "logging messages:",
                status ? "show" : "hide");
  }
  return status;
};


/**
 * Delete all the logging messages
 */
var deleteLogMessages = function () {
  $("#log-messages").empty();
  console.warn("Deleted all logging messages!");
};


/**
 * Get the task status from the server
 *
 * @param {String} url - The URL that handles the "console" AJAX requests.
 */
var getServerTaskStatus = function (url) {
  return $.getJSONUncached(url)
    .fail(function (jqxhr) {
      showModal({
        icon: "times-circle",
        contents: "Failed to get the task status!",
        code: jqxhr.status,
        reason: jqxhr.statusText
      });
    });
};


/**
 * Request to start the task on the server.
 *
 * @param {String} [task=null] - Name of the task to be started.
 *                               If `null`, then start the default task.
 * @param {Object} [kwargs={}] - Keyword arguments will be passed to the task
 */
var startServerTask = function (url, task, kwargs) {
  task = typeof task !== "undefined" ? task : null;
  kwargs = typeof kwargs !== "undefined" ? kwargs : {};
  var data = {action: "start", task: task, kwargs: kwargs};
  return $.postJSON(url, data)
    .fail(function (jqxhr) {
      showModal({
        icon: "times-circle",
        contents: "Failed to start the task!",
        code: jqxhr.status,
        reason: jqxhr.statusText
      });
    });
};


/**
 * Handle the received message of type "console" pushed through the WebSocket
 */
var handleWebSocketMsgConsole = function (msg) {
  if (msg.subtype === "log") {
    appendLogMessage(msg);
  } else if (msg.subtype === "status") {
      updateTaskStatus(msg.status);
  } else {
    console.warn("WebSocket: received message:", msg);
  }
};


$(document).ready(function () {
  // URL to handle the "console" AJAX requests
  var ajax_url = "/ajax/console";

  /**
   * Start the simulation task on the server
   */
  $("#task-start").on("click", function () {
    var button = $(this);
    if ($("#conf-status").data("validity")) {
      button.disable(true);
      updateTaskStatus({running: true, finished: false});
      startServerTask(ajax_url)
        .always(function () { button.disable(false); })
        .done(function () {
          getServerTaskStatus(ajax_url)
            .done(function (response) {
              updateTaskStatus(response.status);
              showModal({
                icon: "check-circle",
                contents: "Simulation task successfully finished."
              });
            });
        });
    } else {
      showModal({
        icon: "times-circle",
        contents: ("Exist invalid configuration values! " +
                   "Please correct the configurations " +
                   "before starting the task")
      });
      console.error("Exist invalid configuration values!");
    }
  });

  /**
   * Logging messages controls
   */
  $("#log-toggle-debug").on("click", function () {
    var status = toggleLogMessages("debug");
    $(this).fadeTo("fast", status ? 1.0 : 0.5);
  });
  $("#log-toggle-info").on("click", function () {
    var status = toggleLogMessages("info");
    $(this).fadeTo("fast", status ? 1.0 : 0.5);
  });
  $("#log-toggle-warning").on("click", function () {
    var status = toggleLogMessages("warning");
    $(this).fadeTo("fast", status ? 1.0 : 0.5);
  });
  $("#log-toggle-error").on("click", function () {
    var status = toggleLogMessages("error");
    toggleLogMessages("critical");
    $(this).fadeTo("fast", status ? 1.0 : 0.5);
  });
  $("#log-delete").on("click", function () {
    showModal({
      icon: "warning",
      contents: "Are you sure to delete all logging messages?",
      buttons: [
        {
          text: "Cancel",
          click: function () { $.modal.close(); }
        },
        {
          text: "Delete!",
          "class": "button-warning",
          click: function () {
            $.modal.close();
            deleteLogMessages();
          }
        }
      ]
    });
  });
});
