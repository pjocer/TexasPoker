// ============================================================
// main.js - 应用入口
// ============================================================

(function () {
    const ui = new UI();
    let game = null;
    let network = null;
    let isOnlineMode = false;
    let loggedInUser = null;
    let authToken = null;
    let currentNickname = null;
    let currentCharacterId = null;
    let currentAvatarType = 'preset';
    let currentAvatarData = null;
    let selectedCharacterId = null;
    let selectedAvatarType = 'preset';
    let selectedAvatarData = null;
    let characterManifest = {
        defaultCharacterId: null,
        aiCharacterIds: [],
        characters: []
    };
    let characterMap = new Map();
    let characterManifestPromise = null;

    // ==================== 登录/注册 ====================
    const authScreen = document.getElementById('auth-screen');
    const authTabs = document.querySelectorAll('.auth-tab');
    const authLoginForm = document.getElementById('auth-login');
    const authRegisterForm = document.getElementById('auth-register');
    const authMessage = document.getElementById('auth-message');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');

    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isLogin = tab.dataset.tab === 'login';
            authLoginForm.style.display = isLogin ? 'block' : 'none';
            authRegisterForm.style.display = isLogin ? 'none' : 'block';
            authMessage.textContent = '';
            authMessage.className = 'auth-message';
        });
    });

    function showAuthMessage(msg, type) {
        authMessage.textContent = msg;
        authMessage.className = 'auth-message ' + type;
    }

    async function readApiResponse(res, fallbackMessage) {
        const contentType = res.headers.get('content-type') || '';
        let data = null;

        try {
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                data = {
                    success: false,
                    message: text.trim() || fallbackMessage
                };
            }
        } catch (e) {
            data = { success: false, message: fallbackMessage };
        }

        if (!res.ok) {
            data.success = false;
            if (!data.message) {
                data.message = fallbackMessage;
            }
        }

        return data;
    }

    function storeCharacterManifest(manifest) {
        characterManifest = {
            defaultCharacterId: manifest.defaultCharacterId || null,
            aiCharacterIds: Array.isArray(manifest.aiCharacterIds) ? manifest.aiCharacterIds : [],
            characters: Array.isArray(manifest.characters) ? manifest.characters : []
        };
        characterMap = new Map(characterManifest.characters.map((character) => [character.id, character]));
        ui.setCharacterManifest(characterManifest);
    }

    async function ensureCharacterManifest() {
        if (!characterManifestPromise) {
            characterManifestPromise = fetch('/src/characters/manifest.json')
                .then((res) => readApiResponse(res, '角色资源加载失败'))
                .then((data) => {
                    if (!Array.isArray(data.characters) || data.characters.length === 0) {
                        throw new Error(data.message || '角色资源为空');
                    }
                    storeCharacterManifest(data);
                    return characterManifest;
                })
                .catch((error) => {
                    characterManifestPromise = null;
                    throw error;
                });
        }

        return characterManifestPromise;
    }

    function normalizeAssetPath(assetPath) {
        if (!assetPath) return '';
        return assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    }

    function getCharacter(characterId) {
        if (characterId && characterMap.has(characterId)) {
            return characterMap.get(characterId);
        }

        if (characterManifest.defaultCharacterId && characterMap.has(characterManifest.defaultCharacterId)) {
            return characterMap.get(characterManifest.defaultCharacterId);
        }

        return characterManifest.characters[0] || null;
    }

    function getCharacterId(characterId) {
        const character = getCharacter(characterId);
        return character ? character.id : null;
    }

    function getCharacterAsset(characterId, key) {
        const character = getCharacter(characterId);
        return character ? normalizeAssetPath(character[key]) : '';
    }

    function getEffectiveAvatarUrl(characterId, avatarType, avatarData) {
        if (avatarType === 'custom' && avatarData) {
            return avatarData;
        }

        return getCharacterAsset(characterId, 'avatarThumb')
            || getCharacterAsset(characterId, 'avatarProfile');
    }

    function applyProfileState(data, fallbackNickname = null) {
        currentNickname = data.nickname || fallbackNickname || currentNickname || '玩家';
        currentCharacterId = getCharacterId(data.characterId);
        currentAvatarType = data.avatarType === 'custom' ? 'custom' : 'preset';
        currentAvatarData = currentAvatarType === 'custom' ? (data.avatarData || null) : null;
    }

    function getSharedAICharacterIds() {
        const validIds = (characterManifest.aiCharacterIds || []).filter((characterId) => characterMap.has(characterId));
        if (validIds.length > 0) return validIds;
        return currentCharacterId ? [currentCharacterId] : [];
    }

    function updateSetupCharacterPreview() {
        const fullBodyEl = document.getElementById('setup-fullbody-display');
        const nameEl = document.getElementById('setup-character-name');
        const titleEl = document.getElementById('setup-character-title');
        const avatarEl = document.getElementById('setup-avatar-preview');
        const modeEl = document.getElementById('setup-avatar-mode');
        const character = getCharacter(currentCharacterId);

        if (!fullBodyEl || !nameEl || !titleEl || !avatarEl || !modeEl || !character) {
            return;
        }

        fullBodyEl.style.backgroundImage = character.fullBody ? `url(${normalizeAssetPath(character.fullBody)})` : '';
        fullBodyEl.classList.toggle('has-image', !!character.fullBody);
        nameEl.textContent = character.name;
        titleEl.textContent = character.title || '内置角色';
        setAvatarImage(avatarEl, currentCharacterId, currentAvatarType, currentAvatarData);
        modeEl.textContent = currentAvatarType === 'custom' ? '当前使用自定义小头像' : '当前使用角色默认头像';
    }

    function updateProfileCharacterPreview() {
        const fullBodyEl = document.getElementById('profile-character-full');
        const nameEl = document.getElementById('profile-character-name');
        const titleEl = document.getElementById('profile-character-title');
        const previewEl = document.getElementById('profile-avatar-preview');
        const character = getCharacter(selectedCharacterId);

        if (!character) return;

        if (fullBodyEl) {
            fullBodyEl.style.backgroundImage = character.fullBody ? `url(${normalizeAssetPath(character.fullBody)})` : '';
            fullBodyEl.classList.toggle('has-image', !!character.fullBody);
        }
        if (nameEl) nameEl.textContent = character.name;
        if (titleEl) titleEl.textContent = character.title || '内置角色';
        if (previewEl) {
            setAvatarImage(previewEl, selectedCharacterId, selectedAvatarType, selectedAvatarData);
        }

        const avatarHint = document.getElementById('profile-avatar-hint');
        if (avatarHint) {
            avatarHint.textContent = selectedAvatarType === 'custom'
                ? '当前使用自定义上传头像'
                : '当前使用角色默认头像';
        }
    }

    function renderProfileCharacterList() {
        const list = document.getElementById('profile-character-list');
        if (!list) return;

        list.innerHTML = '';
        characterManifest.characters.forEach((character) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'profile-character-option';
            if (character.id === selectedCharacterId) {
                button.classList.add('selected');
            }

            button.innerHTML = `
                <span class="profile-character-thumb" style="background-image:url(${normalizeAssetPath(character.avatarThumb)})"></span>
                <span class="profile-character-copy">
                    <span class="profile-character-option-name">${character.name}</span>
                    <span class="profile-character-option-title">${character.title || '内置角色'}</span>
                </span>
            `;

            button.addEventListener('click', () => {
                selectedCharacterId = character.id;
                list.querySelectorAll('.profile-character-option').forEach((option) => {
                    option.classList.toggle('selected', option === button);
                });
                updateProfileCharacterPreview();
            });

            list.appendChild(button);
        });
    }

    loginBtn.addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            showAuthMessage('请输入用户名和密码', 'error');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = '登录中...';

        try {
            await ensureCharacterManifest();
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await readApiResponse(res, '登录失败，请重试');

            if (data.success) {
                loggedInUser = data.username;
                authToken = data.token;
                applyProfileState(data, data.username);
                showScreen('setup');
                playerNameInput.value = currentNickname;
                updateUserBadge();
                updateSetupCharacterPreview();
            } else {
                showAuthMessage(data.message, 'error');
            }
        } catch (e) {
            showAuthMessage(e.message || '网络错误，请重试', 'error');
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = '登 录';
        }
    });

    registerBtn.addEventListener('click', async () => {
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-password-confirm').value;

        if (!username || !password) {
            showAuthMessage('请输入用户名和密码', 'error');
            return;
        }
        if (password !== confirm) {
            showAuthMessage('两次密码输入不一致', 'error');
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = '注册中...';

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await readApiResponse(res, '注册失败，请重试');

            if (data.success) {
                showAuthMessage('注册成功，请登录', 'success');
                // 切换到登录 tab
                authTabs.forEach(t => t.classList.remove('active'));
                document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
                authRegisterForm.style.display = 'none';
                authLoginForm.style.display = 'block';
                document.getElementById('login-username').value = username;
                document.getElementById('login-password').value = '';
                document.getElementById('login-password').focus();
            } else {
                showAuthMessage(data.message, 'error');
            }
        } catch (e) {
            showAuthMessage('网络错误，请重试', 'error');
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = '注 册';
        }
    });

    // 支持回车提交
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });
    document.getElementById('register-password-confirm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerBtn.click();
    });

    // ==================== 用户徽章 + 个人信息 ====================
    const userBadge = document.getElementById('user-badge');
    const badgeNickname = document.getElementById('badge-nickname');
    const badgeAvatar = document.getElementById('badge-avatar');
    const profileScreen = document.getElementById('profile-screen');
    const profileMessage = document.getElementById('profile-message');
    const profileUsePresetBtn = document.getElementById('profile-use-preset-btn');

    function setAvatarImage(el, characterId, avatarType, avatarData) {
        const avatarUrl = getEffectiveAvatarUrl(characterId, avatarType, avatarData);
        if (avatarUrl) {
            el.style.backgroundImage = `url(${avatarUrl})`;
            el.classList.add('has-image');
        } else {
            el.style.backgroundImage = '';
            el.classList.remove('has-image');
        }
    }

    function updateUserBadge() {
        badgeNickname.textContent = currentNickname;
        setAvatarImage(badgeAvatar, currentCharacterId, currentAvatarType, currentAvatarData);
        userBadge.style.display = 'flex';
        updateSetupCharacterPreview();
    }

    // 点击徽章 -> 打开个人信息页
    userBadge.addEventListener('click', () => {
        openProfileScreen();
    });

    async function openProfileScreen() {
        try {
            await ensureCharacterManifest();
        } catch (error) {
            alert(error.message || '角色资源加载失败');
            return;
        }

        profileScreen.style.display = 'flex';
        userBadge.style.display = 'none';
        document.getElementById('profile-nickname').value = currentNickname;
        profileMessage.textContent = '';
        profileMessage.className = 'auth-message';
        selectedCharacterId = currentCharacterId;
        selectedAvatarType = currentAvatarType;
        selectedAvatarData = currentAvatarData;

        // 清空密码字段
        document.getElementById('profile-current-password').value = '';
        document.getElementById('profile-new-password').value = '';
        document.getElementById('profile-confirm-password').value = '';

        renderProfileCharacterList();
        updateProfileCharacterPreview();
    }

    function showProfileMessage(msg, type) {
        profileMessage.textContent = msg;
        profileMessage.className = 'auth-message ' + type;
    }

    profileUsePresetBtn.addEventListener('click', () => {
        selectedAvatarType = 'preset';
        selectedAvatarData = null;
        updateProfileCharacterPreview();
    });

    // 保存昵称和头像
    document.getElementById('profile-save-btn').addEventListener('click', async () => {
        const nickname = document.getElementById('profile-nickname').value.trim();
        if (!nickname) {
            showProfileMessage('昵称不能为空', 'error');
            return;
        }

        try {
            const res = await fetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': authToken },
                body: JSON.stringify({
                    nickname,
                    characterId: selectedCharacterId,
                    avatarType: selectedAvatarType
                })
            });
            const data = await readApiResponse(res, '保存个人信息失败');
            if (data.success) {
                applyProfileState(data, nickname);
                selectedCharacterId = currentCharacterId;
                selectedAvatarType = currentAvatarType;
                selectedAvatarData = currentAvatarData;
                playerNameInput.value = currentNickname;
                updateUserBadge();
                updateProfileCharacterPreview();
                showProfileMessage('保存成功', 'success');
            } else {
                showProfileMessage(data.message, 'error');
            }
        } catch (e) {
            showProfileMessage('网络错误', 'error');
        }
    });

    // 修改密码
    document.getElementById('profile-password-btn').addEventListener('click', async () => {
        const currentPassword = document.getElementById('profile-current-password').value;
        const newPassword = document.getElementById('profile-new-password').value;
        const confirmPassword = document.getElementById('profile-confirm-password').value;

        if (!currentPassword || !newPassword) {
            showProfileMessage('请填写完整', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showProfileMessage('两次新密码不一致', 'error');
            return;
        }

        try {
            const res = await fetch('/api/profile/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': authToken },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await readApiResponse(res, '修改密码失败');
            if (data.success) {
                showProfileMessage(data.message, 'success');
                document.getElementById('profile-current-password').value = '';
                document.getElementById('profile-new-password').value = '';
                document.getElementById('profile-confirm-password').value = '';
            } else {
                showProfileMessage(data.message, 'error');
            }
        } catch (e) {
            showProfileMessage('网络错误', 'error');
        }
    });

    // 返回
    document.getElementById('profile-back-btn').addEventListener('click', () => {
        profileScreen.style.display = 'none';
        updateUserBadge();
    });

    // ==================== 头像上传与裁剪 ====================
    const cropModal = document.getElementById('crop-modal');
    const cropCanvas = document.getElementById('crop-canvas');
    const cropCtx = cropCanvas.getContext('2d');
    const cropArea = document.getElementById('crop-area');
    const CROP_SIZE = 300;
    const CIRCLE_R = 120;
    const OUTPUT_SIZE = 200;

    let cropImage = null;
    let cropX = 0, cropY = 0, cropScale = 1;
    let isDragging = false, dragStartX = 0, dragStartY = 0, dragOriginX = 0, dragOriginY = 0;

    cropCanvas.width = CROP_SIZE;
    cropCanvas.height = CROP_SIZE;

    document.getElementById('profile-upload-btn').addEventListener('click', () => {
        document.getElementById('avatar-file-input').click();
    });

    document.getElementById('avatar-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                cropImage = img;
                // 初始缩放: 让短边填满裁剪圈
                const minDim = Math.min(img.width, img.height);
                cropScale = (CIRCLE_R * 2) / minDim;
                cropX = (CROP_SIZE - img.width * cropScale) / 2;
                cropY = (CROP_SIZE - img.height * cropScale) / 2;
                drawCrop();
                cropModal.style.display = 'flex';
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    function drawCrop() {
        cropCtx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
        if (!cropImage) return;
        cropCtx.drawImage(cropImage, cropX, cropY, cropImage.width * cropScale, cropImage.height * cropScale);
    }

    // 拖动
    cropArea.addEventListener('pointerdown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragOriginX = cropX;
        dragOriginY = cropY;
        cropArea.setPointerCapture(e.pointerId);
    });

    cropArea.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        cropX = dragOriginX + (e.clientX - dragStartX);
        cropY = dragOriginY + (e.clientY - dragStartY);
        drawCrop();
    });

    cropArea.addEventListener('pointerup', () => { isDragging = false; });
    cropArea.addEventListener('pointercancel', () => { isDragging = false; });

    // 缩放
    cropArea.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        const newScale = Math.max(0.1, Math.min(cropScale * delta, 10));

        // 以裁剪区域中心为缩放中心
        const cx = CROP_SIZE / 2;
        const cy = CROP_SIZE / 2;
        cropX = cx - (cx - cropX) * (newScale / cropScale);
        cropY = cy - (cy - cropY) * (newScale / cropScale);
        cropScale = newScale;
        drawCrop();
    }, { passive: false });

    // 确认裁剪
    document.getElementById('crop-confirm-btn').addEventListener('click', async () => {
        const out = document.createElement('canvas');
        out.width = OUTPUT_SIZE;
        out.height = OUTPUT_SIZE;
        const outCtx = out.getContext('2d');

        // 圆形裁剪
        outCtx.beginPath();
        outCtx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
        outCtx.closePath();
        outCtx.clip();

        // 映射: 裁剪圈区域 -> 输出画布
        const circleLeft = (CROP_SIZE / 2) - CIRCLE_R;
        const circleTop = (CROP_SIZE / 2) - CIRCLE_R;
        const ratio = OUTPUT_SIZE / (CIRCLE_R * 2);

        outCtx.drawImage(
            cropImage,
            (circleLeft - cropX) / cropScale,
            (circleTop - cropY) / cropScale,
            (CIRCLE_R * 2) / cropScale,
            (CIRCLE_R * 2) / cropScale,
            0, 0, OUTPUT_SIZE, OUTPUT_SIZE
        );

        const dataUrl = out.toDataURL('image/jpeg', 0.85);

        // 上传
        try {
            const res = await fetch('/api/profile/avatar-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': authToken },
                body: JSON.stringify({ imageData: dataUrl })
            });
            const data = await readApiResponse(res, '头像上传失败');
            if (data.success) {
                currentAvatarType = 'custom';
                currentAvatarData = data.avatarData;
                selectedAvatarType = 'custom';
                selectedAvatarData = data.avatarData;
                updateProfileCharacterPreview();
                updateUserBadge();
                cropModal.style.display = 'none';
                showProfileMessage('头像上传成功', 'success');
            } else {
                showProfileMessage(data.message, 'error');
                cropModal.style.display = 'none';
            }
        } catch (e) {
            showProfileMessage(e.message || '头像上传失败', 'error');
            cropModal.style.display = 'none';
        }
    });

    // 取消裁剪
    document.getElementById('crop-cancel-btn').addEventListener('click', () => {
        cropModal.style.display = 'none';
    });

    // ==================== 启动界面 ====================
    const setupScreen = document.getElementById('setup-screen');
    const roomScreen = document.getElementById('room-screen');
    const playModeBtns = document.querySelectorAll('.play-mode-btn');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const startBtn = document.getElementById('start-btn');
    const playerCountSelect = document.getElementById('player-count');
    const startingChipsInput = document.getElementById('starting-chips');
    const smallBlindInput = document.getElementById('small-blind');
    const bigBlindInput = document.getElementById('big-blind');
    const playerNameInput = document.getElementById('player-name');
    const onlineNameGroup = document.getElementById('online-name-group');
    const onlineButtons = document.getElementById('online-buttons');
    const localSettings = document.getElementById('local-settings');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomIdInput = document.getElementById('room-id-input');

    // 房间界面
    const roomIdDisplay = document.getElementById('room-id-display');
    const roomSettingsInfo = document.getElementById('room-settings-info');
    const roomPlayersList = document.getElementById('room-players-list');
    const roomHostControls = document.getElementById('room-host-controls');
    const roomWaitMsg = document.getElementById('room-wait-msg');
    const roomStartBtn = document.getElementById('room-start-btn');
    const roomBackBtn = document.getElementById('room-back-btn');
    const gameLeaveBtn = document.getElementById('game-leave-btn');

    let selectedMode = GameMode.STANDARD;
    let selectedPlayMode = 'local';
    let isHost = false;

    function resetOnlineSessionState() {
        isOnlineMode = false;
        isHost = false;
        ui.network = null;
        ui._currentOnlineActions = null;
        gameLeaveBtn.style.display = 'none';
        ui.hideActionPanel();
        ui.hideNextHandButton();
        ui.hideRestartButton();
        ui.clearLog();
    }

    function leaveOnlineSession({ notifyServer = true } = {}) {
        const currentNetwork = network;
        network = null;

        if (currentNetwork) {
            if (notifyServer) {
                currentNetwork.leaveRoom();
            } else {
                currentNetwork.disconnect();
            }
        }

        resetOnlineSessionState();
        showScreen('setup');
    }

    // 游戏类型切换 (单机/联网)
    playModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedPlayMode = btn.dataset.playMode;

            if (selectedPlayMode === 'online') {
                startBtn.style.display = 'none';
                onlineNameGroup.style.display = 'block';
                onlineButtons.style.display = 'block';
            } else {
                startBtn.style.display = 'block';
                onlineNameGroup.style.display = 'none';
                onlineButtons.style.display = 'none';
            }
        });
    });

    // 游戏模式切换 (标准/短牌)
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMode = btn.dataset.mode;
        });
    });

    // 单机开始
    startBtn.addEventListener('click', () => {
        const settings = {
            gameMode: selectedMode,
            playerCount: parseInt(playerCountSelect.value),
            startingChips: parseInt(startingChipsInput.value) || 1000,
            smallBlind: parseInt(smallBlindInput.value) || 5,
            bigBlind: parseInt(bigBlindInput.value) || 10
        };

        if (settings.bigBlind <= settings.smallBlind) {
            settings.bigBlind = settings.smallBlind * 2;
        }

        isOnlineMode = false;
        startLocalGame(settings);
    });

    // ==================== 联网模式 ====================

    function getWsUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}`;
    }

    function getSettings() {
        return {
            gameMode: selectedMode,
            playerCount: parseInt(playerCountSelect.value),
            startingChips: parseInt(startingChipsInput.value) || 1000,
            smallBlind: parseInt(smallBlindInput.value) || 10,
            bigBlind: parseInt(bigBlindInput.value) || 20
        };
    }

    function getPlayerName() {
        return (playerNameInput.value || '').trim() || '玩家';
    }

    // 创建房间
    createRoomBtn.addEventListener('click', async () => {
        const name = getPlayerName();
        const settings = getSettings();
        try {
            network = new Network();
            await network.connect(getWsUrl());
            bindNetworkEvents();
            network.createRoom(name, settings, authToken);
        } catch (e) {
            network = null;
            alert('连接服务器失败，请确认服务器已启动');
        }
    });

    // 加入房间
    joinRoomBtn.addEventListener('click', async () => {
        const name = getPlayerName();
        const roomId = (roomIdInput.value || '').trim();
        if (!roomId || roomId.length !== 4) {
            alert('请输入4位房间号');
            return;
        }
        try {
            network = new Network();
            await network.connect(getWsUrl());
            bindNetworkEvents();
            network.joinRoom(roomId, name, authToken);
        } catch (e) {
            network = null;
            alert('连接服务器失败，请确认服务器已启动');
        }
    });

    // 房间界面按钮
    roomStartBtn.addEventListener('click', () => {
        if (network) network.startGame();
    });

    roomBackBtn.addEventListener('click', () => {
        leaveOnlineSession();
    });

    gameLeaveBtn.addEventListener('click', () => {
        if (!network) return;
        if (!confirm('确认离开当前牌桌？本局会按离桌处理。')) return;
        leaveOnlineSession();
    });

    function bindNetworkEvents() {
        network.on('room_created', (msg) => {
            showRoomScreen(
                msg.roomId,
                msg.players,
                msg.settings,
                msg.hostPlayerId,
                msg.yourPlayerId || network.playerId
            );
        });

        network.on('room_joined', (msg) => {
            if (!isOnlineMode) {
                showRoomScreen(
                    msg.roomId,
                    msg.players,
                    msg.settings,
                    msg.hostPlayerId,
                    msg.yourPlayerId || network.playerId
                );
            }
        });

        network.on('room_error', (msg) => {
            alert(msg.message);
        });

        network.on('game_state', (state) => {
            // 旋转玩家数组，让当前用户始终在 index 0 (屏幕正下方)
            const rotatedState = rotatePlayersToMe(state);

            if (!isOnlineMode) {
                isOnlineMode = true;
                gameLeaveBtn.style.display = 'block';
                ui.showGameScreen();
                ui.clearLog();
                ui.hideNextHandButton();
                ui.hideRestartButton();
                ui.network = network;
                // 初始化座位 (首次)
                ui.initPlayerSeats(rotatedState.players.map(p => ({
                    name: p.name,
                    chips: p.chips
                })));
            }
            // 将服务端state中的card JSON恢复为Card对象 (用于UI渲染)
            const uiState = restoreStateCards(rotatedState);
            ui.updateState(uiState);
        });

        network.on('your_turn', (msg) => {
            ui.showOnlineActionPanel(msg.actions);
        });

        network.on('message', (msg) => {
            ui.addLogMessage(msg.text);
        });

        network.on('hand_complete', (msg) => {
            if (msg && msg.canAdvance === false) {
                ui.hideNextHandButton();
                return;
            }
            ui.showNextHandButton(() => {
                if (network) network.sendNextHand();
            });
        });

        network.on('game_over', (msg) => {
            ui.showWinnerOverlay(msg.winner);
            ui.showRestartButton(() => {
                leaveOnlineSession();
            });
        });

        network.on('disconnected', () => {
            if (!network) return;
            leaveOnlineSession({ notifyServer: false });
            alert('连接已断开，已按离桌处理');
        });
    }

    function rotatePlayersToMe(state) {
        const myId = state.myPlayerId;
        const players = state.players;
        const myIndex = players.findIndex(p => p.playerId === myId);
        if (myIndex <= 0) return state; // 已在 index 0 或未找到

        const rotated = [...players.slice(myIndex), ...players.slice(0, myIndex)];
        const newState = { ...state, players: rotated };

        // 调整 currentPlayerIndex
        if (state.currentPlayerIndex >= 0) {
            newState.currentPlayerIndex = (state.currentPlayerIndex - myIndex + players.length) % players.length;
        }

        return newState;
    }

    function restoreStateCards(state) {
        // 将JSON card数据恢复为带有 symbol/color 等属性的对象
        const restored = { ...state };
        restored.communityCards = (state.communityCards || []).map(c => {
            if (!c) return null;
            return new Card(c.suit, c.rank);
        });
        restored.players = state.players.map(p => {
            const rp = { ...p };
            rp.holeCards = (p.holeCards || []).map(c => {
                if (!c) return null;
                return new Card(c.suit, c.rank);
            });
            // 恢复 isInHand getter 语义
            rp.isInHand = !p.isFolded && !p.isBusted;
            rp.isActive = !p.isFolded && !p.isBusted && !p.isAllIn;
            return rp;
        });
        return restored;
    }

    function showRoomScreen(roomId, players, settings, hostPlayerId, yourPlayerId = null) {
        isHost = !!hostPlayerId && hostPlayerId === yourPlayerId;

        showScreen('room');
        roomIdDisplay.textContent = roomId;

        const modeLabel = settings.gameMode === GameMode.SHORT_DECK ? '短牌德州' : '标准德州';
        roomSettingsInfo.innerHTML = `
            <div>${modeLabel} | ${settings.playerCount}人桌</div>
            <div>起始筹码: ${settings.startingChips} | 盲注: ${settings.smallBlind}/${settings.bigBlind}</div>
        `;

        updateRoomPlayers(players, settings.playerCount, hostPlayerId);

        if (isHost) {
            roomHostControls.style.display = 'block';
            roomWaitMsg.style.display = 'none';
        } else {
            roomHostControls.style.display = 'none';
            roomWaitMsg.style.display = 'block';
        }
    }

    function updateRoomPlayers(players, maxPlayers, hostPlayerId) {
        roomPlayersList.innerHTML = '';
        players.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'room-player-item';
            div.textContent = `${i + 1}. ${p.playerName}` + (p.playerId === hostPlayerId ? ' (房主)' : '');
            roomPlayersList.appendChild(div);
        });
        // AI 填位提示
        const aiCount = maxPlayers - players.length;
        if (aiCount > 0) {
            const div = document.createElement('div');
            div.className = 'room-player-item ai-slot';
            div.textContent = `+ ${aiCount} 个AI将填补空位`;
            roomPlayersList.appendChild(div);
        }
    }

    function showScreen(name) {
        authScreen.style.display = name === 'auth' ? 'flex' : 'none';
        profileScreen.style.display = 'none';
        setupScreen.style.display = name === 'setup' ? 'flex' : 'none';
        roomScreen.style.display = name === 'room' ? 'flex' : 'none';
        document.getElementById('game-screen').style.display = name === 'game' ? 'block' : 'none';
        // 徽章在 setup/room 页显示
        if (loggedInUser && (name === 'setup' || name === 'room')) {
            updateUserBadge();
        } else {
            userBadge.style.display = 'none';
        }

        if (name === 'setup') {
            updateSetupCharacterPreview();
        }
    }

    window.addEventListener('pagehide', () => {
        if (network) {
            network.leaveRoom();
        }
    });

    function assignLocalCharacterRoster() {
        if (!game || !Array.isArray(game.players) || game.players.length === 0) return;

        const aiCharacterIds = getSharedAICharacterIds();
        let aiIndex = 0;

        game.players.forEach((player, index) => {
            if (index === 0) {
                player.name = currentNickname || player.name;
                player.characterId = getCharacterId(currentCharacterId);
                player.avatarType = currentAvatarType;
                player.avatarData = currentAvatarType === 'custom' ? currentAvatarData : null;
                return;
            }

            player.characterId = aiCharacterIds[aiIndex % aiCharacterIds.length] || getCharacterId(currentCharacterId);
            player.avatarType = 'preset';
            player.avatarData = null;
            aiIndex++;
        });
    }

    // ==================== 单机游戏逻辑 ====================
    function startLocalGame(settings) {
        gameLeaveBtn.style.display = 'none';
        ui.showGameScreen();
        ui.clearLog();
        ui.hideNextHandButton();
        ui.hideRestartButton();
        ui.network = null;

        game = new Game(settings);
        assignLocalCharacterRoster();
        ui.game = game;

        ui.initPlayerSeats(game.players);

        game.onStateChange = (state) => {
            ui.updateState(state);
        };

        game.onMessage = (msg) => {
            ui.addLogMessage(msg);
        };

        game.onHandComplete = () => {
            const human = game.players[0];
            if (human.isBusted) {
                ui.addLogMessage('你已出局!');
                ui.showRestartButton(() => {
                    showScreen('setup');
                });
                return;
            }

            ui.showNextHandButton(() => {
                game.startNewHand();
            });
        };

        game.onGameOver = (winner) => {
            ui.showWinnerOverlay(winner);
            ui.showRestartButton(() => {
                showScreen('setup');
            });
        };

        game.startNewHand();
    }

    // ==================== 键盘快捷键 ====================
    document.addEventListener('keydown', (e) => {
        // 联网模式下的快捷键
        if (isOnlineMode && network) {
            if (!ui._currentOnlineActions) return;
            const actions = ui._currentOnlineActions;
            switch (e.key) {
                case 'f':
                case 'F': {
                    const fold = actions.find(a => a.action === Action.FOLD);
                    if (fold) {
                        ui.hideActionPanel();
                        network.sendAction(Action.FOLD, 0);
                    }
                    break;
                }
                case 'c':
                case 'C': {
                    const check = actions.find(a => a.action === Action.CHECK);
                    const call = actions.find(a => a.action === Action.CALL);
                    if (check) {
                        ui.hideActionPanel();
                        network.sendAction(Action.CHECK, 0);
                    } else if (call) {
                        ui.hideActionPanel();
                        network.sendAction(Action.CALL, call.amount);
                    }
                    break;
                }
                case ' ':
                case 'Enter': {
                    const nextBtn = document.querySelector('.next-hand-btn:not(.hidden)');
                    if (nextBtn) { nextBtn.click(); e.preventDefault(); }
                    break;
                }
            }
            return;
        }

        // 单机模式快捷键
        if (!game) return;
        const actions = game.getAvailableActions();
        if (actions.length === 0) return;

        switch (e.key) {
            case 'f':
            case 'F': {
                const fold = actions.find(a => a.action === Action.FOLD);
                if (fold) {
                    ui.hideActionPanel();
                    game.submitHumanAction({ action: Action.FOLD, amount: 0 });
                }
                break;
            }
            case 'c':
            case 'C': {
                const call = actions.find(a => a.action === Action.CALL);
                const check = actions.find(a => a.action === Action.CHECK);
                if (check) {
                    ui.hideActionPanel();
                    game.submitHumanAction({ action: Action.CHECK, amount: 0 });
                } else if (call) {
                    ui.hideActionPanel();
                    game.submitHumanAction({ action: Action.CALL, amount: call.amount });
                }
                break;
            }
            case ' ':
            case 'Enter': {
                const nextBtn = document.querySelector('.next-hand-btn:not(.hidden)');
                if (nextBtn) {
                    nextBtn.click();
                    e.preventDefault();
                }
                break;
            }
        }
    });

    ensureCharacterManifest().catch(() => {});
})();
