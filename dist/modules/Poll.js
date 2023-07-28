import {constants, flags} from "./constants.mjs";
import Socket from "./Socket.js";
import WorkshopError from "./utility/Error.js";
import Utility from "./utility/Utility.mjs";

export default class Poll extends ChatMessage {
  static #template = 'poll.hbs';

  static async create(data, options = {}) {
    const pollSettings = {
      mode: options.mode,
      display: options.display,
      secret: options.secret
    }

    data = {
      total: 0,
      question: data.question,
      parts: data.parts.map(p => {
        return {label: p, percent: 0, count: 0}
      }),
      answers: [],
      settings: pollSettings
    };

    let message = await renderTemplate(Utility.getTemplate(this.#template), data);

    let messageData = {
      content: message
    };

    let messageEntity = await super.create(messageData, options);
    await messageEntity.setFlag(constants.moduleId, flags.isPoll, true);
    await messageEntity.setFlag(constants.moduleId, flags.pollData, data);
    await messageEntity.setFlag(constants.moduleId, flags.pollSettings, pollSettings);

    return messageEntity;
  }

  static async renderPoll(chatMessage, html, listeners = true) {
    $(html).addClass('forien-poll');
    let data = chatMessage.getFlag(constants.moduleId, flags.pollData);
    if (!data) return;

    let isDisplayingResults = game.user.getFlag(constants.moduleId, flags.pollResults) || [];
    data = duplicate(data);
    data.isGM = game.user.isGM;
    data.results = (game.user.isGM || isDisplayingResults.includes(chatMessage._id));
    data.poll = chatMessage._id;
    data.parts.forEach(p => {
      let answer = data.answers.find(a => a.user === game.user._id && a.label === p.label)
      p.checked = answer ? answer.status : false;
      p.voters = [];
      data.answers.filter(a => a.label === p.label).forEach(a => p.voters.push(game.users.get(a.user)?.name));
    });

    let newHtml = await renderTemplate(Utility.getTemplate(this.#template), data);
    $(html).find('.message-content').html(newHtml);

    if (!listeners) return;

    html.on("click", "input[type=checkbox]", (event) => {
      let answer = event.currentTarget.dataset.answer;
      let poll = event.currentTarget.dataset.poll;
      let checked = event.currentTarget.checked;
      Socket.sendAnswer(poll, answer, checked)
    });

    html.on("click", "button.toggle", async (event) => {
      let poll = event.currentTarget.dataset.poll;
      let isDisplayingResults = game.user.getFlag(constants.moduleId, flags.pollResults) || [];
      isDisplayingResults = duplicate(isDisplayingResults);

      if (isDisplayingResults.includes(poll)) {
        isDisplayingResults = isDisplayingResults.filter(p => p !== poll)
      } else {
        isDisplayingResults.push(poll);
      }

      await game.user.setFlag(constants.moduleId, flags.pollResults, isDisplayingResults)
      this.renderPoll(chatMessage, html, false);
    });
  }

  static async answer(id, answer, status, user) {
    let poll = game.messages.get(id);
    if (poll) {
      let data = poll.getFlag(constants.moduleId, flags.pollData);
      if (data) {
        let answers = data.answers;

        answers = answers.filter(a => !(a.user === user && a.label === answer));
        answers.push(this.makeAnswer(answer, status, user));
        data.answers = answers;
        data = await this.recalculate(data);

        await poll.setFlag(constants.moduleId, flags.pollData, data);
        return;
      }
    }
    throw new WorkshopError(game.i18n.format('Forien.EasyPolls.console.errors.noPoll'));
  }

  static async recalculate(data) {
    console.log(data);
    // remove reference;
    data = duplicate(data);

    data.total = data.answers.filter(a => a.status).length;
    data.parts.forEach(p => {
      p.count = data.answers.filter(a => (p.label === a.label && a.status === true)).length;
      p.percent = Math.round(p.count / data.total * 100);
    });

    return data;
  }

  static makeAnswer(answer, status, user = game.user._id) {
    return {
      label: answer,
      status: status,
      user: user
    }
  }
}
