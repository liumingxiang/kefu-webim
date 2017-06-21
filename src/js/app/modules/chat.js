app.chat = (function (
	_const, utils, uikit, apiHelper, channel, profile, eventListener,
	satisfaction, initAgentInputStatePoller, initAgentStatePoller,
	initQueuingNumberPoller, initTransferToKefuButton, initSessionList
){
	var isEmojiInitilized;
	var isMessageChannelReady;
	var inputBoxPosition;
	var config;

	// DOM init
	var topBar = document.querySelector('.em-widget-header');
	var editorView = document.querySelector('.em-widget-send-wrapper');
	easemobim.imBtn = document.getElementById('em-widgetPopBar');

	// todo: 把dom都移到里边
	var doms = {
		imChat: document.getElementById('em-kefu-webim-chat'),
		agentStatusText: topBar.querySelector('.em-header-status-text'),
		nickname: topBar.querySelector('.em-widget-header-nickname'),
		dragBar: topBar.querySelector('.drag-bar'),
		minifyBtn: topBar.querySelector('.btn-min'),
		audioBtn: topBar.querySelector('.btn-audio'),
		switchKeyboardBtn: topBar.querySelector('.btn-keyboard'),

		emojiBtn: editorView.querySelector('.em-bar-emoji'),
		sendImgBtn: editorView.querySelector('.em-widget-img'),
		sendFileBtn: editorView.querySelector('.em-widget-file'),
		sendBtn: editorView.querySelector('.em-widget-send'),
		satisfaction: editorView.querySelector('.em-widget-satisfaction'),
		textInput: editorView.querySelector('.em-widget-textarea'),
		noteBtn: editorView.querySelector('.em-widget-note'),

		imgInput: document.querySelector('.upload-img-container'),
		fileInput: document.querySelector('.upload-file-container'),
		emojiContainer: document.querySelector('.em-bar-emoji-container'),
		chatWrapper: document.querySelector('.chat-wrapper'),
		emojiWrapper: document.querySelector('.em-bar-emoji-wrapper'),

		topBar: topBar,
		editorView: editorView,
		block: null
	};

	var chat = {
		doms: doms,
		init: _init,
		handleReady: _handleReady,
		close: _close,
		show: _show,
		playSound: function(){},
		block: null
	};

	return chat;

	function _initSystemEventListener(){
		// 更新坐席名称
		eventListener.add(_const.SYSTEM_EVENT.SESSION_OPENED, _updateAgentNickname);
		eventListener.add(_const.SYSTEM_EVENT.SESSION_TRANSFERED, _updateAgentNickname);
		eventListener.add(_const.SYSTEM_EVENT.SESSION_CLOSED, _updateAgentNickname);
		eventListener.add(_const.SYSTEM_EVENT.AGENT_NICKNAME_CHANGED, _updateAgentNickname);
		eventListener.add(_const.SYSTEM_EVENT.SESSION_RESTORED, _updateAgentNickname);
		eventListener.add(_const.SYSTEM_EVENT.SESSION_NOT_CREATED, _updateAgentNickname);
		eventListener.add(_const.SYSTEM_EVENT.OFFICIAL_ACCOUNT_SWITCHED, _updateAgentNickname);

		// report visitor info
		eventListener.add(_const.SYSTEM_EVENT.SESSION_OPENED, _reportVisitorInfo);
		eventListener.add(_const.SYSTEM_EVENT.SESSION_RESTORED, _reportVisitorInfo);

		// get greetings
		eventListener.add(_const.SYSTEM_EVENT.SESSION_RESTORED, _getGreetings);
		eventListener.add(_const.SYSTEM_EVENT.SESSION_NOT_CREATED, _getGreetings);
	}

	function _updateAgentNickname(officialAccount) {
		if (officialAccount !== profile.currentOfficialAccount) return;

		var nickname = profile.currentAgentNickname;
		var isSessionOpen = officialAccount.isSessionOpen;

		if (officialAccount.type === 'CUSTOM'){
			// 昵称显示为服务号名称
			doms.nickname.innerText = officialAccount.name;
		}
		else if (
			profile.nickNameOption
			&& nickname
			&& isSessionOpen
		) {
			doms.nickname.innerText = nickname;
		}
		else {
			doms.nickname.innerText = profile.defaultAgentName;
		}
	}

	function _reportVisitorInfo(officialAccount){
		if (officialAccount.hasReportedAttributes) return;

		var officialAccountId = officialAccount.official_account_id;
		var sessionId = officialAccount.sessionId;
		var isSessionOpen = officialAccount.isSessionOpen;

		if (isSessionOpen && sessionId){
			officialAccount.hasReportedAttributes = true;
			apiHelper.reportVisitorAttributes(sessionId);
		}
	}

	function _getGreetings(officialAccount) {
		if (officialAccount.isSessionOpen) return;
		Promise.all([
			apiHelper.getSystemGreeting(),
			apiHelper.getRobertGreeting(),
			apiHelper.getSkillgroupMenu()
		]).then(function(result){
			var systemGreetingText = result[0];
			var robotGreetingObj = result[1];
			var groupMenus = result[2];
			var greetingTextType = robotGreetingObj.greetingTextType;
			var greetingText = robotGreetingObj.greetingText;
			var greetingObj = {};

			// 系统欢迎语
			systemGreetingText && channel.handleReceive({
				data: systemGreetingText,
				noprompt: true
			}, 'txt');

			// 机器人欢迎语
			switch (greetingTextType) {
			case 0:
				// 文本消息
				channel.handleReceive({
					data: greetingText,
					noprompt: true
				}, 'txt');
				break;
			case 1:
				// 菜单消息
				greetingObj = JSON.parse(greetingText.replace(/&amp;quot;/g, '"'));

				greetingObj.ext && channel.handleReceive({
					ext: greetingObj.ext,
					noprompt: true
				});
				break;
			case undefined:
				// 未设置机器人欢迎语
				break;
			default:
				console.error('unknown robot greeting type.');
				break;
			}

			// 技能组列表
			groupMenus && channel.handleReceive({
				data: groupMenus,
				type: 'skillgroupMenu',
				noprompt: true
			});
		});
	}

	function _initUI(){
		(utils.isTop || !config.minimum) && utils.removeClass(doms.imChat, 'hide');

		// 设置联系客服按钮文字
		document.querySelector('.em-widget-pop-bar').innerText = config.buttonText;

		// 添加移动端样式类
		utils.isMobile && utils.addClass(document.body, 'em-mobile');

		// 留言按钮
		config.ticket && utils.removeClass(doms.noteBtn, 'hide');

		// 最小化按钮
		config.minimum
			&& !utils.isTop
			&& utils.removeClass(doms.minifyBtn, 'hide');

		// 低版本浏览器不支持上传文件/图片
		if (WebIM.utils.isCanUploadFileAsync){
			utils.removeClass(doms.sendImgBtn, 'hide');
			utils.removeClass(doms.sendFileBtn, 'hide');
		}

		// h5title设置
		if(config.ui.H5Title.enabled){
			document.title = config.ui.H5Title.content;
		}

		// 静音按钮
		window.HTMLAudioElement
			&& !utils.isMobile
			&& config.soundReminder
			&& utils.removeClass(doms.audioBtn, 'hide');

		// 输入框位置开关
		utils.isMobile
			&& !config.hideKeyboard
			&& utils.removeClass(doms.switchKeyboardBtn, 'hide');

		// 满意度评价按钮
		config.satisfaction
			&& utils.removeClass(
				document.querySelector('.em-widget-satisfaction'),
				'hide'
			);
	}

	function _initSoundReminder(){
		if (!window.HTMLAudioElement || utils.isMobile || !config.soundReminder) {
			return;
		}

		var audioDom = document.createElement('audio');
		var slienceSwitch = document.querySelector('.em-widget-header .btn-audio');
		var isSlienceEnable = false;
		var play = _.throttle(function () {
			audioDom.play();
		}, 3000, { trailing: false });

		audioDom.src = config.staticPath + '/mp3/msg.m4a';

		//音频按钮静音
		utils.on(slienceSwitch, 'click', function () {
			isSlienceEnable = !isSlienceEnable;
			utils.toggleClass(slienceSwitch, 'icon-slience', isSlienceEnable);
			utils.toggleClass(slienceSwitch, 'icon-bell', !isSlienceEnable);
		});

		chat.playSound = function () {
			if (!isSlienceEnable) {
				play();
			}
		};
	}

	function _setLogo() {
		if (!config.logo.enabled) return;
		var logoImgWapper = document.querySelector('.em-widget-tenant-logo');
		var logoImg = logoImgWapper.querySelector('img');

		utils.removeClass(logoImgWapper, 'hide');
		logoImg.src = config.logo.url;
	}

	function _setNotice() {
		var noticeContent = document.querySelector('.em-widget-tip .content');
		var noticeCloseBtn = document.querySelector('.em-widget-tip .tip-close');

		apiHelper.getNotice().then(function(notice){
			if(!notice.enabled) return;
			var slogan = notice.content;

			// 设置信息栏内容
			noticeContent.innerHTML = WebIM.utils.parseLink(slogan);
			// 显示信息栏
			utils.addClass(doms.imChat, 'has-tip');

			// 隐藏信息栏按钮
			utils.on(
				noticeCloseBtn,
				utils.click,
				function () {
					// 隐藏信息栏
					utils.removeClass(doms.imChat, 'has-tip');
				}
			);
		});
	}

	function _initEmoji() {
		utils.on(doms.emojiBtn, utils.click, function () {
			doms.textInput.blur();
			utils.toggleClass(doms.emojiWrapper, 'hide');

			// 懒加载，打开表情面板时才初始化图标
			if (!isEmojiInitilized) {
				isEmojiInitilized = true;
				doms.emojiContainer.innerHTML = genHtml();
			}
		});

		// 表情的选中
		utils.live('img.emoji', utils.click, function (e) {
			!utils.isMobile && doms.textInput.focus();
			doms.textInput.value += this.getAttribute('data-value');
			utils.trigger(doms.textInput, 'change');
		}, doms.emojiWrapper);

		// todo: kill .e-face to make it more elegant
		// ie8 does not support stopPropagation -_-||
		// 点击别处时隐藏表情面板
		utils.on(document, utils.click, function (ev) {
			var e = window.event || ev;
			var target = e.srcElement || e.target;

			if (!utils.hasClass(target, 'e-face')) {
				utils.addClass(doms.emojiWrapper, 'hide');
			}
		});

		function genHtml() {
			var path = WebIM.Emoji.path;
			var EMOJI_COUNT_PER_LINE = 7;

			return _.chain(WebIM.Emoji.map)
				// 生成图标html
				.map(function (value, key) {
					return '<div class="em-bar-emoji-bg e-face">'
						+ '<img class="e-face emoji" src="'
						+ path + value
						+ '" data-value=' + key + ' />'
						+ '</div>';
				})
				// 按照下标分组
				.groupBy(function (elem, index) {
					return Math.floor(index / EMOJI_COUNT_PER_LINE);
				})
				// 增加wrapper
				.map(function (elem) {
					return '<li class="e-face">' + elem.join('') + '</li>';
				})
				// 结束链式调用
				.value()
				// 把数组拼接成字符串
				.join('');
		}
	}

	function _setOffline() {
		switch (config.offDutyType) {
		case 'none':
			// 下班禁止留言、禁止接入会话
			utils.appendHTMLToBody([
				'<div class="em-model"></div>',
				'<div class="em-dialog off-duty-prompt">',
				'<div class="bg-color header">提示</div>',
				'<div class="body">',
				'<p class="content">' + config.offDutyWord + '</p>',
				'</div>',
				'</div>'
			].join(''));
			break;
		default:
			// 只允许留言此时无法关闭留言页面
			app.leaveMessage({hideCloseBtn: true});
			break;
		}
	}

	function _scrollToBottom(){
		var scrollToBottom = utils.getDataByPath(profile, 'currentOfficialAccount.messageView.scrollToBottom');
		// 有可能在 messageView 未初始化时调用
		// todo: remove this detect
		typeof scrollToBottom === 'function' && scrollToBottom();
	}

	function _initAutoGrow(){
		var originHeight = doms.textInput.clientHeight;

		utils.on(doms.textInput, 'input change', update);

		function update() {
			var height = this.value ? this.scrollHeight : originHeight;
			this.style.height = height + 'px';
			this.scrollTop = 9999;
			callback();
		}

		function callback() {
			var height = doms.editorView.getBoundingClientRect().height;
			if (inputBoxPosition === 'up') {
				doms.emojiWrapper.style.top = 43 + height + 'px';
			}
			else {
				doms.chatWrapper.style.bottom = height + 'px';
				doms.emojiWrapper.style.bottom = height + 'px';
			}
			_scrollToBottom();
		}
	}

	function _initOfficialAccount(){
		apiHelper.getOfficalAccounts().then(function(officialAccountList){
			_.each(officialAccountList, channel.attemptToAppendOfficialAccount);

			eventListener.excuteCallbacks(_const.SYSTEM_EVENT.OFFICIAL_ACCOUNT_LIST_GOT, []);
		}, function(err){
			// 未创建会话时初始化默认服务号
			if (err === _const.ERROR_MSG.VISITOR_DOES_NOT_EXIST){
				// init default system message view
				channel.attemptToAppendOfficialAccount({
					type: 'SYSTEM',
					official_account_id: 'default',
					img: null
				});

				profile.currentOfficialAccount = profile.systemOfficialAccount;

				eventListener.excuteCallbacks(_const.SYSTEM_EVENT.SESSION_NOT_CREATED, [profile.systemOfficialAccount]);
			}
			else {
				throw err;
			}
		});

		// 获取在线坐席数
		apiHelper.getExSession().then(function(data) {
			profile.hasHumanAgentOnline = data.onlineHumanAgentCount > 0;
			profile.hasRobotAgentOnline = data.onlineRobotAgentCount > 0;
		});
	}

	function _bindEvents() {
		if (!utils.isTop) {
			// 最小化按钮
			utils.on(document.querySelector('.em-widget-header .btn-min'), 'click', function () {
				transfer.send({ event: _const.EVENTS.CLOSE });
			});

			utils.on(easemobim.imBtn, utils.click, function () {
				transfer.send({ event: _const.EVENTS.SHOW });
			});

			utils.on(document, 'mouseover', function () {
				transfer.send({ event: _const.EVENTS.RECOVERY });
			});
		}

		utils.on(doms.chatWrapper, 'click', function () {
			doms.textInput.blur();
		});

		utils.live('img.em-widget-imgview', 'click', function () {
			var imgSrc = this.getAttribute('src');
			easemobim.imgView.show(imgSrc);
		});

		if (config.dragenable && !utils.isTop && !utils.isMobile) {

			doms.dragBar.style.cursor = 'move';

			utils.on(doms.dragBar, 'mousedown', function (ev) {
				var e = window.event || ev;
				doms.textInput.blur(); //ie a  ie...
				transfer.send({
					event: _const.EVENTS.DRAGREADY,
					data: {
						x: e.clientX,
						y: e.clientY
					}
				});
				return false;
			}, false);
		}

		//resend
		utils.live('div.em-widget-msg-status', utils.click, function () {
			var id = this.getAttribute('id').slice(0, -'_failed'.length);
			var type = this.getAttribute('data-type');

			channel.reSend(type, id);
			utils.addClass(this, 'hide');
			utils.removeClass(document.getElementById(id + '_loading'), 'hide');
		});

		utils.live('button.js_robotTransferBtn', utils.click, function () {
			var id = this.getAttribute('data-id');
			var ssid = this.getAttribute('data-sessionid');

			// 只能评价1次
			if (!this.clicked) {
				this.clicked = true;
				channel.sendTransferToKf(id, ssid);
			}
		});

		utils.live('button.js-transfer-to-ticket', utils.click, function (){
			var officialAccount = profile.currentOfficialAccount;
			if (!officialAccount) return;

			var isSessionOpen = officialAccount.isSessionOpen;
			var sessionId = officialAccount.sessionId;

			isSessionOpen && apiHelper.closeServiceSession(sessionId);

			app.leaveMessage({
				preData: {
					name: config.visitor.trueName,
					phone: config.visitor.phone,
					mail: config.visitor.email,
					// 	取最近10条消息，最大1000字
					content: utils.getBrief('\n' + officialAccount.messageView.getRecentMsg(10), 1000)
				}
			});
		});

		// 机器人列表
		utils.live('button.js_robotbtn', utils.click, function () {
			channel.sendText(this.innerText, {
				ext: {
					msgtype: {
						choice: {
							menuid: this.getAttribute('data-id')
						}
					}
				}
			});
		});

		// 根据菜单项选择指定的技能组
		utils.live('button.js_skillgroupbtn', utils.click, function () {
			channel.sendText(this.innerText, {
				ext: {
					weichat: {
						queueName: this.getAttribute('data-queue-name')
					}
				}
			});
		});

		// 满意度评价
		utils.live('button.js_satisfybtn', 'click', function () {
			var serviceSessionId = this.getAttribute('data-servicesessionid');
			var inviteId = this.getAttribute('data-inviteid');
			satisfaction.show(inviteId, serviceSessionId);
		});

		var messagePredict = _.throttle(function (msg) {
			var officialAccount = profile.currentOfficialAccount || {};
			var sessionId = officialAccount.sessionId;
			var sessionState = officialAccount.sessionState;
			var agentType = officialAccount.agentType;
			var content = utils.getBrief(msg, _const.MESSAGE_PREDICT_MAX_LENGTH);

			if (
				sessionState === _const.SESSION_STATE.PROCESSING
				&& agentType !== _const.AGENT_ROLE.ROBOT
				&& sessionId
			){
				apiHelper.reportPredictMessage(sessionId, content);
			}
		}, 1000);

		function handleSendBtn() {
			var isEmpty = !doms.textInput.value.trim();

			utils.toggleClass(
				doms.sendBtn,
				'disabled', !isMessageChannelReady || isEmpty
			);
			profile.grayList.msgPredictEnable
				&& !isEmpty
				&& isMessageChannelReady
				&& messagePredict(doms.textInput.value);
		}

		if (Modernizr.oninput) {
			utils.on(doms.textInput, 'input change', handleSendBtn);
		}
		else {
			utils.on(doms.textInput, 'keyup change', handleSendBtn);
		}

		if (utils.isMobile) {
			utils.on(doms.textInput, 'focus touchstart', function () {
				doms.textInput.style.overflowY = 'auto';
				_scrollToBottom();
			});

			// 键盘上下切换按钮
			utils.on(
				document.querySelector('.em-widget-header .btn-keyboard'),
				'click',
				function () {
					var status = utils.hasClass(this, 'icon-keyboard-down');
					var height = doms.editorView.getBoundingClientRect().height;
					inputBoxPosition = status ? 'down' : 'up';

					utils.toggleClass(this, 'icon-keyboard-up', status);
					utils.toggleClass(this, 'icon-keyboard-down', !status);

					switch (inputBoxPosition) {
					case 'up':
						doms.editorView.style.bottom = 'auto';
						doms.editorView.style.zIndex = '3';
						doms.editorView.style.top = '43px';
						doms.chatWrapper.style.bottom = '0';
						doms.emojiWrapper.style.bottom = 'auto';
						doms.emojiWrapper.style.top = 43 + height + 'px';
						break;
					case 'down':
						doms.editorView.style.bottom = '0';
						doms.editorView.style.zIndex = '3';
						doms.editorView.style.top = 'auto';
						doms.chatWrapper.style.bottom = height + 'px';
						doms.emojiWrapper.style.bottom = height + 'px';
						doms.emojiWrapper.style.top = 'auto';
						_scrollToBottom();
						break;
					}
				}
			);
		}

		// 发送文件
		utils.on(doms.fileInput, 'change', function () {
			var fileInput = doms.fileInput;
			var filesize = utils.getDataByPath(fileInput, 'files.0.size');

			if (!fileInput.value) {
				// 未选择文件
			}
			else if (filesize > _const.UPLOAD_FILESIZE_LIMIT) {
				uikit.tip('文件大小不能超过10MB');
				fileInput.value = '';
			}
			else {
				channel.sendFile(WebIM.utils.getFileUrl(fileInput), fileInput);
			}
		});

		// 发送图片
		utils.on(doms.imgInput, 'change', function () {
			var fileInput = doms.imgInput;
			// ie8-9 do not support multifiles, so you can not get files
			var filesize = utils.getDataByPath(fileInput, 'files.0.size');

			if (!fileInput.value) {
				// 未选择文件
			}
			// 某些浏览器不能获取到正确的文件名，所以放弃文件类型检测
			// else if (!/\.(png|jpg|jpeg|gif)$/i.test(fileInput.value)) {
				// uikit.tip('不支持的图片格式');
			// }
			// 某些浏览器无法获取文件大小, 忽略
			else if (filesize > _const.UPLOAD_FILESIZE_LIMIT) {
				uikit.tip('文件大小不能超过10MB');
				fileInput.value = '';
			}
			else {
				channel.sendImg(WebIM.utils.getFileUrl(fileInput), fileInput);
			}
		});

		//弹出文件选择框
		utils.on(doms.sendFileBtn, 'click', function () {
			// 发送文件是后来加的功能，无需考虑IE兼容
			if (!isMessageChannelReady) {
				uikit.tip('正在连接中...');
			}
			else {
				doms.fileInput.click();
			}
		});

		utils.on(doms.sendImgBtn, 'click', function () {
			if (!isMessageChannelReady) {
				uikit.tip('正在连接中...');
			}
			else {
				doms.imgInput.click();
			}
		});

		// 显示留言页面
		utils.on(doms.noteBtn, 'click', function () {
			app.leaveMessage();
		});

		// 满意度评价
		utils.on(doms.satisfaction, 'click', function () {
			doms.textInput.blur();
			satisfaction.show();
		});

		// 回车发送消息
		utils.on(doms.textInput, 'keydown', function (evt) {
			if (
				evt.keyCode === 13
				&& !utils.isMobile
				&& !evt.ctrlKey
				&& !evt.shiftKey
			) {
				// ie8 does not support preventDefault & stopPropagation
				if (evt.preventDefault) {
					evt.preventDefault();
				}
				utils.trigger(doms.sendBtn, 'click');
			}
		});

		utils.on(doms.sendBtn, 'click', function () {
			var textMsg = doms.textInput.value;

			if (utils.hasClass(this, 'disabled')) {
				// 禁止发送
			}
			else if (textMsg.length > _const.MAX_TEXT_MESSAGE_LENGTH) {
				uikit.tip('输入字数过多');
			}
			else {
				channel.sendText(textMsg);
				doms.textInput.value = '';
				utils.trigger(doms.textInput, 'change');
			}
		});
	}

	function _close() {
		profile.isChatWindowOpen = false;

		if (!config.hide) {
			utils.addClass(doms.imChat, 'hide');
			utils.removeClass(easemobim.imBtn, 'hide');
		}

		eventListener.excuteCallbacks(_const.SYSTEM_EVENT.CHAT_WINDOW_CLOSED, []);
	}

	function _show() {
		profile.isChatWindowOpen = true;
		utils.addClass(easemobim.imBtn, 'hide');
		utils.removeClass(doms.imChat, 'hide');
		_scrollToBottom();
		if (
			// todo: fix this issue
			// todo: onInit !isChatWindowOpen && _show()
			// 可能会在初始化完成之前读取config
			config && config.isInOfficehours
			// IE 8 will throw an error when focus an invisible element
			&& doms.textInput.offsetHeight > 0
		) {
			doms.textInput.focus();
		}

		transfer.send({ event: _const.EVENTS.RECOVERY });

		eventListener.excuteCallbacks(_const.SYSTEM_EVENT.CHAT_WINDOW_OPENED, []);
	}

	function _handleReady(info) {
		if (isMessageChannelReady) return;

		isMessageChannelReady = true;
		doms.sendBtn.innerHTML = '发送';
		utils.trigger(doms.textInput, 'change');

		// bug fix:
		// minimum = fales 时, 或者 访客回呼模式 调用easemobim.bind时显示问题
		if (config.minimum === false || config.eventCollector === true) {
			transfer.send({ event: _const.EVENTS.SHOW });
		}
		if (info) {
			config.user.token = config.user.token || info.accessToken;
		}


		// 发送扩展消息
		while (profile.commandMessageToBeSendList.length > 0){
			channel.sendText('', profile.commandMessageToBeSendList.pop());
		}

		// onready 回调
		transfer.send({ event: _const.EVENTS.ONREADY });

		if (config.extMsg) {
			channel.sendText('', { ext: config.extMsg });
		}
	}

	function _init() {
		config = profile.config;

		channel.init();

		channel.initConnection();

		profile.isChatWindowOpen = true;

		_initSoundReminder();

		_initUI();

		_initEmoji();

		_bindEvents();

		initSessionList();

		// todo: 去掉getGrayList的block
		Promise.all([
			apiHelper.getDutyStatus(),
			apiHelper.getGrayList(),
			apiHelper.getToken()
		]).then(function(result){
			var dutyStatus = result[0];
			var grayList = result[1];

			// 灰度列表
			profile.grayList = grayList;

			// 当配置为下班进会话时执行与上班相同的逻辑
			config.isInOfficehours = dutyStatus || config.offDutyType === 'chat';

			if (config.isInOfficehours) {
				// 显示广告条
				_setLogo();

				// 移动端输入框自动增长
				utils.isMobile && _initAutoGrow();

				// 初始化服务号列表
				_initOfficialAccount();

				// 添加sdk回调
				channel.listen();

				// 连接xmpp server
				channel.open();

				// 设置信息栏
				_setNotice();

				// 获取坐席昵称设置
				apiHelper.getNickNameOption().then(function(displayNickname){
					profile.nickNameOption = displayNickname;
				});

				_initSystemEventListener();
				initAgentInputStatePoller();
				initAgentStatePoller();
				initQueuingNumberPoller();
				initTransferToKefuButton();

				// 第二通道收消息初始化
				channel.initSecondChannle();

				// todo: move to handle ready
				app.initPasteImage();
			}
			else {
				// 设置下班时间展示的页面
				_setOffline();
			}
		}, function (err) {
			throw err;
		});
	}
}(
	easemobim._const,
	easemobim.utils,
	app.uikit,
	app.apiHelper,
	app.channel,
	app.profile,
	app.eventListener,
	app.satisfaction,
	app.initAgentInputStatePoller,
	app.initAgentStatePoller,
	app.initQueuingNumberPoller,
	app.initTransferToKefuButton,
	app.initSessionList
));
