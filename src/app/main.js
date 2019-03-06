/**
 * Created by qhyang on 2017/12/1.
 */

import 'whatwg-fetch';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import 'url-polyfill';

import Vue from 'vue';
import Vuex from 'vuex';

import VueConfirm from '../scripts/vue-confirm';

import interact from 'interactjs';

import '../styles/bootstrap';
import '../styles/base';
import '../styles/pretty-checkbox';

import * as mutationTypes from '../scripts/mutation-types';

import { i18n, loadLocale } from './i18n';
import { generateLayout } from '../scripts/utils';

import SourceGroup from './source/SourceGroup';
import QueueGroup from './queue/QueueGroup';
import PlayerController from './PlayerController';
import Queue from './queue/Queue';
import RandomQueue from './queue/RandomQueue';
import Track from './Track';
import Artist from './Artist';
import Player from './Player';
import Background from './visualization/visual_controllers/Background';
import Visualizer from './visualization/visual_controllers/Visualizer';

import App from './app';

(async () => {
    if (!window['Promise']) {
        window['Promise'] = await import('promise-polyfill');
    }

    Vue.use(Vuex);
    Vue.use(VueConfirm);

    const interactables = [];
    const bindingValues = [];

    Vue.directive('interact', {
        bind(el, bindings) {
            const interactable = interact(el);

            el.dataset.interactable = interactables.push(interactable) - 1;

            const bindingValueIndex = bindingValues.push(bindings.value) - 1;

            el.dataset.bindingValue = bindingValueIndex;

            switch (bindings.arg) {
                case 'doubletap':
                    interactable.on('doubletap', () => bindingValues[bindingValueIndex]());
                    break;
                case 'tap':
                default:
                    interactable.on('tap', () => bindingValues[bindingValueIndex]());
            }
        },
        update(el, bindings) {
            if (bindings.value === bindings.oldValue) {
                return;
            }

            const bindingValueIndex = +el.dataset.bindingValue;

            bindingValues[bindingValueIndex] = bindings.value;
        },
        unbind(el) {
            if (interactables[+el.dataset.interactable]) {
                interactables[+el.dataset.interactable].unset();
                delete interactables[+el.dataset.interactable];
            }

            if (bindingValues[+el.dataset.bindingValue]) {
                delete bindingValues[+el.dataset.bindingValue];
            }
        }
    });

    const locale = localStorage.getItem('kaiplayerlocale') || window.navigator.language || 'en-US';

    loadLocale(locale);

    const generalModule = {
        state: {
            activePanel: {
                index: null,
                lock: false
            },
            mode: null,
            layout: null,
            backgroundImage: localStorage.getItem('kaiplayerbackgroundimage') || 'http://bubblesoft.oss-ap-southeast-1.aliyuncs.com/1d69083104fb0c7d0e3a568d72f3eff8_numendil-333089-unsplash.jpg',
            showSourceIcon: (() => {
                const showSourceIcon = localStorage.getItem('kaiplayershowsouceicon');

                return showSourceIcon ? Boolean(+showSourceIcon) : true;
            })(),
            locale
        },

        mutations: {
            [mutationTypes.UPDATE_ACTIVE_PANEL_INDEX] (state, index) {
                state.activePanel.index = index;
            },
            [mutationTypes.SET_ACTIVE_PANEL_INDEX_LOCK] (state, boolean) {
                state.activePanel.lock = boolean;
            },
            [mutationTypes.SET_MODE] (state, mode) {
                state.mode = mode;
            },
            [mutationTypes.LOAD_LAYOUT] (state, layout) {
                state.layout = layout;
            },
            [mutationTypes.SAVE_LAYOUT] (state, { index, layout }) {
                state.layout[index] = layout;
            },
            [mutationTypes.SET_BACKGROUND_IMAGE] (state, url) {
                state.backgroundImage = url;
                localStorage.setItem('kaiplayerbackgroundimage', url);
            },
            [mutationTypes.SET_LOCALE] (state, locale) {
                loadLocale(locale);
                state.locale = locale;
                localStorage.setItem('kaiplayerlocale', locale);
            },
            [mutationTypes.SET_SHOW_SOURCE_ICON] (state, showSourceIcon) {
                state.showSourceIcon = showSourceIcon;
                localStorage.setItem('kaiplayershowsouceicon', Number(showSourceIcon));
            }
        },
        actions: {
            loadLayout({ commit, state }, { mode = state.mode }) {
                const layoutData = localStorage.getItem('kaiplayerlayout' + mode);

                if (layoutData) {
                    commit(mutationTypes.LOAD_LAYOUT, JSON.parse(layoutData));
                } else {
                    const viewportWidth = window.innerWidth,
                        viewportHeight = window.innerHeight - document.querySelector('#control-bar').offsetHeight;

                    commit(mutationTypes.LOAD_LAYOUT, generateLayout(mode, viewportWidth, viewportHeight));
                }
            },
            saveLayout({ commit, state }, { index, layout }) {
                commit(mutationTypes.SAVE_LAYOUT, { index, layout });
                localStorage.setItem('kaiplayerlayout' + state.mode, JSON.stringify(state.layout));
            }
        }
    };

    const sourceGroup = new SourceGroup({ name: 'Global' });

    const sourceModule = {
        state: {
            sourceGroup
        },
        mutations: {
            [mutationTypes.ADD_SOURCES] (state, sources) {
                state.sourceGroup.add(...sources);
            },
            [mutationTypes.UPDATE_SOURCE] (state, { index, active }) {
                state.sourceGroup.get(index).active = active;
                localStorage.setItem('kaiplayersourceactive', JSON.stringify((() => {
                    const data = {};

                    state.sourceGroup.get().forEach(source => {
                       data[source.id] = source.active;
                    });

                    return data;
                })()));
            }
        }
    };

    const saveQueueData = (queueGroup, playingQueueIndex) => {
            localStorage.setItem('kaiplayerplayingqueues', JSON.stringify({
                queues: queueGroup.get().map(queue => {
                    return {
                        type: (() => {
                            switch (queue.constructor) {
                                case RandomQueue:
                                    return 'random';

                                case Queue:
                                default:
                                    return 'basic';
                            }
                        })(),
                        name: queue.name,
                        tracks: queue.get().map(track => ({
                            id: track.id,
                            name: track.name,
                            duration: track.duration,
                            streamUrl: track.streamUrl,
                            artists: track.artists.map(artist => ({ name: artist.name })),
                            picture: track.picture
                        })),
                        active: queue.active
                    }
                }),
                active: queueGroup.active,
                playing: playingQueueIndex
            }));
        },

        restoreQueueData = () => {
            const queueGroup = new QueueGroup({ name: 'Global' });

            let playingQueueIndex = null;

            const queueGroupData = JSON.parse(localStorage.getItem('kaiplayerplayingqueues'));

            if (queueGroupData && queueGroupData.queues.length) {
                queueGroup.add(...queueGroupData.queues.map(queueData => {
                    const queue = (() => {
                        switch (queueData.type) {
                            case 'random':
                                return new RandomQueue({ name: queueData.name });

                            case 'basic':
                            default:
                                return new Queue({ name: queueData.name });
                        }
                    })();

                    queue.active = queueData.active;

                    if (queueData.tracks.length) {
                        queue.add(...queueData.tracks.map(trackData => new Track({
                            id: trackData.id,
                            name: trackData.name,
                            duration: trackData.duration,
                            streamUrl: trackData.streamUrl,
                            artists: trackData.artists.map(artistData => {
                                return new Artist({
                                    name: artistData.name
                                })
                            }),
                            picture: trackData.picture
                        })));
                    }

                    return queue;
                }));

                queueGroup.active = queueGroupData.active;
                playingQueueIndex = queueGroupData.playing;
            }

            return {
                queueGroup,
                playingQueueIndex
            }
        };

    const queueData = restoreQueueData();

    const queueModule = {
        state: {
            queueGroup: queueData.queueGroup,
            playingQueueIndex: queueData.playingQueueIndex
        },
        mutations: {
            [mutationTypes.UPDATE_QUEUE_GROUP](state, { queues, active }) {
                queues && state.queueGroup.update(queues);

                if (typeof active === 'number') {
                    state.queueGroup.active = active;
                }

                saveQueueData(state.queueGroup, state.playingQueueIndex);
            },

            [mutationTypes.INSERT_QUEUE](state, { index, queue }) {
                state.queueGroup.insert(index, queue);
                saveQueueData(state.queueGroup, state.playingQueueIndex);
            },

            [mutationTypes.UPDATE_QUEUE](state, { index, name, tracks, active }) {
                const queue = state.queueGroup.get(index);

                name && (queue.name = name);
                tracks && queue.update(tracks);

                if (typeof active === 'number' || active === null) {
                    queue.active = active;
                }

                saveQueueData(state.queueGroup, state.playingQueueIndex);
            },

            [mutationTypes.UPDATE_PLAYING_QUEUE_INDEX](state, index) {
                state.playingQueueIndex = index;
                saveQueueData(state.queueGroup, state.playingQueueIndex);
            },

            [mutationTypes.ADD_TRACK](state, { track, queue = state.queueGroup.get(state.queueGroup.active) }) {
                queue.add(track);
                saveQueueData(state.queueGroup, state.playingQueueIndex);
            },

            [mutationTypes.UPDATE_TRACK](state, { index, duration, queue = state.queueGroup.get(state.queueGroup.active) }) {
                if (duration) {
                    queue.get(index).duration = duration;
                    saveQueueData(state.queueGroup, state.playingQueueIndex);
                }
            },

            [mutationTypes.SWITCH_QUEUE_MODE](state, { queue = state.queueGroup.get(state.queueGroup.active) } = {}) {
                queue.switchMode();
            }
        }
    };

    const playerController = new PlayerController;

    playerController.connect(new Player);

    const playerModule = {
        state: {
            playerController,
            get playing() {
                return this.playerController.player.playing
            }
        }
    };

    const backgroundType = localStorage.getItem('kaisoftbackgroundtype'),
        visualizerType = localStorage.getItem('kaisoftvisualizertype');

    const visualizationModule = {
        state: {
            backgroundType,
            visualizerType,
            init: false,
            _background: null,
            _visualizer: null,
            _audioSouce: null
        },
        mutations: {
            [mutationTypes.INIT_VISUALIZATION](state, renderers) {
                state._background = new Background(backgroundType || 'three', renderers);
                state._visualizer = new Visualizer(visualizerType || 'random', renderers);
                state.init = true;
            },

            [mutationTypes.UPDATE_ACTIVE_BACKGROUND_TYPE](state, type) {
                state.backgroundType = type;
                localStorage.setItem('kaisoftbackgroundtype', type);
            },

            [mutationTypes.UPDATE_ACTIVE_VISUALIZER_TYPE](state, type) {
                state.visualizerType = type;
                localStorage.setItem('kaisoftvisualizertype', type);
            },

            [mutationTypes.VISUALIZER_LISTEN_TO](state, audioSource) {
                if (state._visualizer) {
                    state._visualizer.listen(audioSource);
                }

                state._audioSouce = audioSource;
            },

            [mutationTypes.BACKGROUND_LOAD_RESOURCE](state, { picture } = {}) {
                if (state._background) {
                    state._background.loadResource({ picture });
                }
            },

            [mutationTypes.VISUALIZER_LOAD_RESOURCE](state, { picture } = {}) {
                if (state._visualizer) {
                    state._visualizer.loadResource({ picture });
                }
            }
        },
        actions: {
            async initVisualization({ commit, state }, mountPoint) {
                const renderers = await import('./visualization/renderers/renderers');

                try {
                    renderers.threeRenderer.init(mountPoint);
                } catch (e) { }

                renderers.histogramRenderer.init(mountPoint);
                renderers.electricArcRenderer.init(mountPoint);
                renderers.artworkRenderer.init(mountPoint);

                commit(mutationTypes.INIT_VISUALIZATION, renderers);

                const playing = playerModule.state.playing;

                if (playing && state._audioSource) {
                    state._visualizer.listen(state._audioSource);
                    state._visualizer.activeRenderer.start();
                    state._visualizer.start();
                    state._visualizer.activeRenderer.show();
                } else if (!playing) {
                    state._background.activeRenderer.start();
                    state._background.start();
                    state._background.activeRenderer.show();
                }

                const queueGroup = queueModule.state.queueGroup,
                    queue = queueGroup.get(queueGroup.active),
                    track = queue ? queue.get(queue.active) : null;

                if (track) {
                    commit(mutationTypes.BACKGROUND_LOAD_RESOURCE, { picture: track.picture });
                }
            },
            async triggerBackgroundEvent({ commit, state }, type) {
                await state._background.event(type);
            }
        }
    };

    const store = new Vuex.Store({
        modules: {
            generalModule,
            sourceModule,
            queueModule,
            playerModule,
            visualizationModule
        }
    });

    const vm = new Vue({
        el: 'app',
        store,
        i18n,
        render: createElement => createElement(App)
    });

    let cancelVisualizationChange = null;

    vm.$watch(() => ([
        visualizationModule.state.backgroundType,
        visualizationModule.state.visualizerType,
        playerModule.state.playing
    ]), async ([newBackground, newVisualization, newPlaying], [oldBackground, oldVisualization, oldPlaying]) => {
        if (newBackground === oldBackground && newVisualization === oldVisualization && newPlaying === oldPlaying) {
            return;
        }

        if (cancelVisualizationChange) {
            cancelVisualizationChange();
        }

        const state = visualizationModule.state;

        if (!oldPlaying && state._background.animating) {
            try {
                await new Promise((resolve, reject) => {
                    cancelVisualizationChange = reject;

                    const unwatch = vm.$watch('$store.state.visualizationModule._background.animating', (animating) => {
                        if (animating) {
                            return;
                        }

                        unwatch();
                        cancelVisualizationChange = null;
                        resolve();
                    });
                });
            } catch (e) {
                return;
            }
        }

        const background = state._background,
            oldBackgroundRenderer = background.activeRenderer;

        background.activeType = newBackground;

        const newBackgroundRenderer = background.activeRenderer;

        if (newBackground !== oldBackground) {
            if (!newPlaying && !oldPlaying && newBackgroundRenderer !== oldBackgroundRenderer) {
                oldBackgroundRenderer.hide();
                oldBackgroundRenderer.pause();
                newBackgroundRenderer.start();
                newBackgroundRenderer.show();
            }

            state._background = null;
            state._background = background;
        }

        const visualizer = state._visualizer,
            oldVisualizerRenderer = visualizer.activeRenderer;

        visualizer.activeType = newVisualization;

        const newVisualizerRenderer = visualizer.activeRenderer;

        if (newVisualization !== oldVisualization || newVisualization === 'random') {
            if (newPlaying && oldPlaying && newVisualizerRenderer !== oldVisualizerRenderer) {
                oldVisualizerRenderer.hide();
                oldVisualizerRenderer.pause();
                newVisualizerRenderer.start();
                newVisualizerRenderer.show();
            }

            state._visualizer = null;
            state._visualizer = visualizer;
        }

        if (newPlaying !== oldPlaying) {
            if (newPlaying && !oldPlaying) {
                if (oldBackgroundRenderer !== newVisualizerRenderer) {
                    oldBackgroundRenderer.hide();
                    newVisualizerRenderer.start();
                    visualizer.start();
                    newVisualizerRenderer.show();
                    background.stop();
                    oldBackgroundRenderer.pause();
                    background.event('reset');
                } else {
                    background.stop();
                    visualizer.start();
                }
            } else if (!newPlaying && oldPlaying) {
                if (newBackgroundRenderer !== oldVisualizerRenderer) {
                    oldVisualizerRenderer.hide();
                    newBackgroundRenderer.start();
                    background.start();
                    newBackgroundRenderer.show();
                    visualizer.stop();
                    oldVisualizerRenderer.pause();
                } else {
                    visualizer.stop();
                    background.start();
                }
            }
        }
    });
})();
