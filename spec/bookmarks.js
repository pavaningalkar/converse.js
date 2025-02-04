(function (root, factory) {
    define([
        "jasmine",
        "mock",
        "test-utils"
        ], factory);
} (this, function (jasmine, mock, test_utils) {
    "use strict";
    const $iq = converse.env.$iq,
         $msg = converse.env.$msg,
         Strophe = converse.env.Strophe,
         sizzle = converse.env.sizzle,
         _ = converse.env._,
         u = converse.env.utils;


    describe("A chat room", function () {

        it("can be bookmarked", mock.initConverse(
                ['rosterGroupsFetched', 'emojisInitialized'], {},
                async function (done, _converse) {

            await test_utils.waitUntilDiscoConfirmed(
                _converse, _converse.bare_jid,
                [{'category': 'pubsub', 'type': 'pep'}],
                ['http://jabber.org/protocol/pubsub#publish-options']
            );
            let sent_stanza, IQ_id;
            const sendIQ = _converse.connection.sendIQ;
            spyOn(_converse.connection, 'sendIQ').and.callFake(function (iq, callback, errback) {
                sent_stanza = iq;
                IQ_id = sendIQ.bind(this)(iq, callback, errback);
            });
            spyOn(_converse.connection, 'getUniqueId').and.callThrough();

            await test_utils.openChatRoom(_converse, 'theplay', 'conference.shakespeare.lit', 'JC');
            var jid = 'theplay@conference.shakespeare.lit';
            const view = _converse.chatboxviews.get(jid);
            spyOn(view, 'renderBookmarkForm').and.callThrough();
            spyOn(view, 'closeForm').and.callThrough();
            await u.waitUntil(() => !_.isNull(view.el.querySelector('.toggle-bookmark')));
            let toggle = view.el.querySelector('.toggle-bookmark');
            expect(toggle.title).toBe('Bookmark this groupchat');
            toggle.click();
            expect(view.renderBookmarkForm).toHaveBeenCalled();

            view.el.querySelector('.button-cancel').click();
            expect(view.closeForm).toHaveBeenCalled();
            expect(u.hasClass('on-button', toggle), false);
            expect(toggle.title).toBe('Bookmark this groupchat');

            toggle.click();
            expect(view.renderBookmarkForm).toHaveBeenCalled();

            /* Client uploads data:
             * --------------------
             *  <iq from='juliet@capulet.lit/balcony' type='set' id='pip1'>
             *      <pubsub xmlns='http://jabber.org/protocol/pubsub'>
             *          <publish node='storage:bookmarks'>
             *              <item id='current'>
             *                  <storage xmlns='storage:bookmarks'>
             *                      <conference name='The Play&apos;s the Thing'
             *                                  autojoin='true'
             *                                  jid='theplay@conference.shakespeare.lit'>
             *                          <nick>JC</nick>
             *                      </conference>
             *                  </storage>
             *              </item>
             *          </publish>
             *          <publish-options>
             *              <x xmlns='jabber:x:data' type='submit'>
             *                  <field var='FORM_TYPE' type='hidden'>
             *                      <value>http://jabber.org/protocol/pubsub#publish-options</value>
             *                  </field>
             *                  <field var='pubsub#persist_items'>
             *                      <value>true</value>
             *                  </field>
             *                  <field var='pubsub#access_model'>
             *                      <value>whitelist</value>
             *                  </field>
             *              </x>
             *          </publish-options>
             *      </pubsub>
             *  </iq>
             */
            expect(view.model.get('bookmarked')).toBeFalsy();
            const form = view.el.querySelector('.chatroom-form');
            form.querySelector('input[name="name"]').value = 'Play&apos;s the Thing';
            form.querySelector('input[name="autojoin"]').checked = 'checked';
            form.querySelector('input[name="nick"]').value = 'JC';

            _converse.connection.IQ_stanzas = [];
            view.el.querySelector('.btn-primary').click();

            await u.waitUntil(() => sent_stanza);
            expect(sent_stanza.toLocaleString()).toBe(
                `<iq from="romeo@montague.lit/orchard" id="${IQ_id}" type="set" xmlns="jabber:client">`+
                    `<pubsub xmlns="http://jabber.org/protocol/pubsub">`+
                        `<publish node="storage:bookmarks">`+
                            `<item id="current">`+
                                `<storage xmlns="storage:bookmarks">`+
                                    `<conference autojoin="true" jid="theplay@conference.shakespeare.lit" name="Play&amp;apos;s the Thing">`+
                                        `<nick>JC</nick>`+
                                    `</conference>`+
                                `</storage>`+
                            `</item>`+
                        `</publish>`+
                        `<publish-options>`+
                            `<x type="submit" xmlns="jabber:x:data">`+
                                `<field type="hidden" var="FORM_TYPE">`+
                                    `<value>http://jabber.org/protocol/pubsub#publish-options</value>`+
                                `</field>`+
                                `<field var="pubsub#persist_items">`+
                                    `<value>true</value>`+
                                `</field>`+
                                `<field var="pubsub#access_model">`+
                                    `<value>whitelist</value>`+
                                `</field>`+
                            `</x>`+
                        `</publish-options>`+
                    `</pubsub>`+
                `</iq>`
            );
            /* Server acknowledges successful storage
             *
             * <iq to='juliet@capulet.lit/balcony' type='result' id='pip1'/>
             */
            const stanza = $iq({
                'to':_converse.connection.jid,
                'type':'result',
                'id':IQ_id
            });
            _converse.connection._dataRecv(test_utils.createRequest(stanza));
            await u.waitUntil(() => view.model.get('bookmarked'));
            toggle = await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));
            expect(view.model.get('bookmarked')).toBeTruthy();
            expect(toggle.title).toBe('Unbookmark this groupchat');
            expect(u.hasClass('on-button', toggle), true);
            // We ignore this IQ stanza... (unless it's an error stanza), so
            // nothing to test for here.
            done();
        }));


        it("will be automatically opened if 'autojoin' is set on the bookmark", mock.initConverse(
            ['rosterGroupsFetched'], {},
            async function (done, _converse) {

            await test_utils.waitUntilDiscoConfirmed(
                _converse, _converse.bare_jid,
                [{'category': 'pubsub', 'type': 'pep'}],
                ['http://jabber.org/protocol/pubsub#publish-options']
            );
            await u.waitUntil(() => _converse.bookmarks);
            let jid = 'lounge@montague.lit';
            _converse.bookmarks.create({
                'jid': jid,
                'autojoin': false,
                'name':  'The Lounge',
                'nick': ' Othello'
            });
            expect(_converse.chatboxviews.get(jid) === undefined).toBeTruthy();

            jid = 'theplay@conference.shakespeare.lit';
            _converse.bookmarks.create({
                'jid': jid,
                'autojoin': true,
                'name':  'The Play',
                'nick': ' Othello'
            });
            await new Promise(resolve => _converse.api.listen.once('chatBoxInitialized', resolve));
            expect(_.isUndefined(_converse.chatboxviews.get(jid))).toBeFalsy();

            // Check that we don't auto-join if muc_respect_autojoin is false
            _converse.muc_respect_autojoin = false;
            jid = 'balcony@conference.shakespeare.lit';
            _converse.bookmarks.create({
                'jid': jid,
                'autojoin': true,
                'name':  'Balcony',
                'nick': ' Othello'
            });
            expect(_converse.chatboxviews.get(jid) === undefined).toBe(true);
            done();
        }));


        describe("when bookmarked", function () {

            it("will use the nickname from the bookmark", mock.initConverse(
                    ['rosterGroupsFetched'], {}, async function (done, _converse) {

                await test_utils.waitUntilBookmarksReturned(_converse);
                const muc_jid = 'coven@chat.shakespeare.lit';
                _converse.bookmarks.create({
                    'jid': muc_jid,
                    'autojoin': false,
                    'name':  'The Play',
                    'nick': 'Othello'
                });
                spyOn(_converse.ChatRoom.prototype, 'getAndPersistNickname').and.callThrough();
                const room_creation_promise = _converse.api.rooms.open(muc_jid);
                await test_utils.getRoomFeatures(_converse, muc_jid);
                const room = await room_creation_promise;
                await u.waitUntil(() => room.getAndPersistNickname.calls.count());
                expect(room.get('nick')).toBe('Othello');
                done();
            }));

            it("displays that it's bookmarked through its bookmark icon", mock.initConverse(
                ['rosterGroupsFetched'], {},
                async function (done, _converse) {

                test_utils.waitUntilDiscoConfirmed(
                    _converse, _converse.bare_jid,
                    [{'category': 'pubsub', 'type': 'pep'}],
                    ['http://jabber.org/protocol/pubsub#publish-options']
                );
                await _converse.api.rooms.open(`lounge@montague.lit`);
                const view = _converse.chatboxviews.get('lounge@montague.lit');
                let bookmark_icon = await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));
                expect(_.includes(bookmark_icon.classList, 'button-on')).toBeFalsy();
                _converse.bookmarks.create({
                    'jid': view.model.get('jid'),
                    'autojoin': false,
                    'name':  'The lounge',
                    'nick': ' some1'
                });
                view.model.set('bookmarked', true);
                bookmark_icon = await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));
                expect(_.includes(bookmark_icon.classList, 'button-on')).toBeTruthy();
                view.model.set('bookmarked', false);
                bookmark_icon = await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));
                expect(_.includes(bookmark_icon.classList, 'button-on')).toBeFalsy();
                done();
            }));

            it("can be unbookmarked", mock.initConverse(
                    ['rosterGroupsFetched'], {}, async function (done, _converse) {

                await test_utils.waitUntilBookmarksReturned(_converse);
                const muc_jid = 'theplay@conference.shakespeare.lit';
                await _converse.api.rooms.open(muc_jid);
                const view = _converse.chatboxviews.get(muc_jid);
                await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));

                spyOn(view, 'toggleBookmark').and.callThrough();
                spyOn(_converse.bookmarks, 'sendBookmarkStanza').and.callThrough();
                view.delegateEvents();

                _converse.bookmarks.create({
                    'jid': view.model.get('jid'),
                    'autojoin': false,
                    'name':  'The Play',
                    'nick': ' Othello'
                });

                expect(_converse.bookmarks.length).toBe(1);
                await u.waitUntil(() => _converse.chatboxes.length >= 1);
                expect(view.model.get('bookmarked')).toBeTruthy();
                let bookmark_icon = await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));
                expect(u.hasClass('button-on', bookmark_icon)).toBeTruthy();

                spyOn(_converse.connection, 'getUniqueId').and.callThrough();
                bookmark_icon.click();
                bookmark_icon = await u.waitUntil(() => view.el.querySelector('.toggle-bookmark'));
                expect(view.toggleBookmark).toHaveBeenCalled();
                expect(u.hasClass('button-on', bookmark_icon)).toBeFalsy();
                expect(_converse.bookmarks.length).toBe(0);

                // Check that an IQ stanza is sent out, containing no
                // conferences to bookmark (since we removed the one and
                // only bookmark).
                const sent_stanza = _converse.connection.IQ_stanzas.pop();
                expect(Strophe.serialize(sent_stanza)).toBe(
                    `<iq from="romeo@montague.lit/orchard" id="${sent_stanza.getAttribute('id')}" type="set" xmlns="jabber:client">`+
                        `<pubsub xmlns="http://jabber.org/protocol/pubsub">`+
                            `<publish node="storage:bookmarks">`+
                                `<item id="current">`+
                                    `<storage xmlns="storage:bookmarks"/>`+
                                `</item>`+
                            `</publish>`+
                            `<publish-options>`+
                                `<x type="submit" xmlns="jabber:x:data">`+
                                    `<field type="hidden" var="FORM_TYPE">`+
                                        `<value>http://jabber.org/protocol/pubsub#publish-options</value>`+
                                    `</field>`+
                                    `<field var="pubsub#persist_items">`+
                                        `<value>true</value>`+
                                    `</field>`+
                                    `<field var="pubsub#access_model">`+
                                        `<value>whitelist</value>`+
                                    `</field>`+
                                `</x>`+
                            `</publish-options>`+
                        `</pubsub>`+
                    `</iq>`
                );
                done();
            }));
        });

        describe("and when autojoin is set", function () {

            it("will be be opened and joined automatically upon login", mock.initConverse(
                ['rosterGroupsFetched'], {},
                async function (done, _converse) {

                await test_utils.waitUntilBookmarksReturned(_converse);
                spyOn(_converse.api.rooms, 'create').and.callThrough();
                const jid = 'theplay@conference.shakespeare.lit';
                const model = _converse.bookmarks.create({
                    'jid': jid,
                    'autojoin': false,
                    'name':  'The Play',
                    'nick': ''
                });
                expect(_converse.api.rooms.create).not.toHaveBeenCalled();
                _converse.bookmarks.remove(model);
                _converse.bookmarks.create({
                    'jid': jid,
                    'autojoin': true,
                    'name':  'Hamlet',
                    'nick': ''
                });
                expect(_converse.api.rooms.create).toHaveBeenCalled();
                done();
            }));
        });
    });

    describe("Bookmarks", function () {

        it("can be pushed from the XMPP server", mock.initConverse(
                ['rosterGroupsFetched', 'connected'], {}, async function (done, _converse) {

            await test_utils.waitUntilBookmarksReturned(_converse);

            /* The stored data is automatically pushed to all of the user's
             * connected resources.
             *
             * Publisher receives event notification
             * -------------------------------------
             * <message from='juliet@capulet.lit'
             *         to='juliet@capulet.lit/balcony'
             *         type='headline'
             *         id='rnfoo1'>
             * <event xmlns='http://jabber.org/protocol/pubsub#event'>
             *     <items node='storage:bookmarks'>
             *     <item id='current'>
             *         <storage xmlns='storage:bookmarks'>
             *         <conference name='The Play&apos;s the Thing'
             *                     autojoin='true'
             *                     jid='theplay@conference.shakespeare.lit'>
             *             <nick>JC</nick>
             *         </conference>
             *         </storage>
             *     </item>
             *     </items>
             * </event>
             * </message>
             */
            const stanza = $msg({
                'from': 'romeo@montague.lit',
                'to': 'romeo@montague.lit/orchard',
                'type': 'headline',
                'id': 'rnfoo1'
            }).c('event', {'xmlns': 'http://jabber.org/protocol/pubsub#event'})
                .c('items', {'node': 'storage:bookmarks'})
                    .c('item', {'id': 'current'})
                        .c('storage', {'xmlns': 'storage:bookmarks'})
                            .c('conference', {'name': 'The Play&apos;s the Thing',
                                            'autojoin': 'true',
                                            'jid':'theplay@conference.shakespeare.lit'})
                                .c('nick').t('JC');
            _converse.connection._dataRecv(test_utils.createRequest(stanza));
            await u.waitUntil(() => _converse.bookmarks.length);
            expect(_converse.bookmarks.length).toBe(1);
            expect(_converse.chatboxviews.get('theplay@conference.shakespeare.lit')).not.toBeUndefined();
            done();
        }));


        it("can be retrieved from the XMPP server", mock.initConverse(
                ['chatBoxesFetched', 'roomsPanelRendered', 'rosterGroupsFetched'], {},
                async function (done, _converse) {

            await test_utils.waitUntilDiscoConfirmed(
                _converse, _converse.bare_jid,
                [{'category': 'pubsub', 'type': 'pep'}],
                ['http://jabber.org/protocol/pubsub#publish-options']
            );
            /* Client requests all items
             * -------------------------
             *
             *  <iq from='juliet@capulet.lit/randomID' type='get' id='retrieve1'>
             *  <pubsub xmlns='http://jabber.org/protocol/pubsub'>
             *      <items node='storage:bookmarks'/>
             *  </pubsub>
             *  </iq>
             */
            const IQ_stanzas = _converse.connection.IQ_stanzas;
            const sent_stanza = await u.waitUntil(
                () => IQ_stanzas.filter(s => sizzle('items[node="storage:bookmarks"]', s).length).pop());

            expect(Strophe.serialize(sent_stanza)).toBe(
                `<iq from="romeo@montague.lit/orchard" id="${sent_stanza.getAttribute('id')}" type="get" xmlns="jabber:client">`+
                '<pubsub xmlns="http://jabber.org/protocol/pubsub">'+
                    '<items node="storage:bookmarks"/>'+
                '</pubsub>'+
                '</iq>');

            /*
             * Server returns all items
             * ------------------------
             * <iq type='result'
             *     to='juliet@capulet.lit/randomID'
             *     id='retrieve1'>
             * <pubsub xmlns='http://jabber.org/protocol/pubsub'>
             *     <items node='storage:bookmarks'>
             *     <item id='current'>
             *         <storage xmlns='storage:bookmarks'>
             *         <conference name='The Play&apos;s the Thing'
             *                     autojoin='true'
             *                     jid='theplay@conference.shakespeare.lit'>
             *             <nick>JC</nick>
             *         </conference>
             *         </storage>
             *     </item>
             *     </items>
             * </pubsub>
             * </iq>
             */
            expect(_converse.bookmarks.models.length).toBe(0);

            spyOn(_converse.bookmarks, 'onBookmarksReceived').and.callThrough();
            var stanza = $iq({'to': _converse.connection.jid, 'type':'result', 'id':sent_stanza.getAttribute('id')})
                .c('pubsub', {'xmlns': Strophe.NS.PUBSUB})
                    .c('items', {'node': 'storage:bookmarks'})
                        .c('item', {'id': 'current'})
                            .c('storage', {'xmlns': 'storage:bookmarks'})
                                .c('conference', {
                                    'name': 'The Play&apos;s the Thing',
                                    'autojoin': 'true',
                                    'jid': 'theplay@conference.shakespeare.lit'
                                }).c('nick').t('JC').up().up()
                                .c('conference', {
                                    'name': 'Another room',
                                    'autojoin': 'false',
                                    'jid': 'another@conference.shakespeare.lit'
                                }); // Purposefully exclude the <nick> element to test #1043
            _converse.connection._dataRecv(test_utils.createRequest(stanza));
            await u.waitUntil(() => _converse.bookmarks.onBookmarksReceived.calls.count());
            await _converse.api.waitUntil('bookmarksInitialized');
            expect(_converse.bookmarks.models.length).toBe(2);
            expect(_converse.bookmarks.findWhere({'jid': 'theplay@conference.shakespeare.lit'}).get('autojoin')).toBe(true);
            expect(_converse.bookmarks.findWhere({'jid': 'another@conference.shakespeare.lit'}).get('autojoin')).toBe(false);
            done();
        }));

        describe("The rooms panel", function () {

            it("shows a list of bookmarks", mock.initConverse(
                ['rosterGroupsFetched'], {},
                async function (done, _converse) {

                await test_utils.waitUntilDiscoConfirmed(
                    _converse, _converse.bare_jid,
                    [{'category': 'pubsub', 'type': 'pep'}],
                    ['http://jabber.org/protocol/pubsub#publish-options']
                );
                test_utils.openControlBox(_converse);

                const IQ_stanzas = _converse.connection.IQ_stanzas;
                const sent_stanza = await u.waitUntil(
                    () => IQ_stanzas.filter(s => sizzle('items[node="storage:bookmarks"]', s).length).pop());

                expect(Strophe.serialize(sent_stanza)).toBe(
                    `<iq from="romeo@montague.lit/orchard" id="${sent_stanza.getAttribute('id')}" type="get" xmlns="jabber:client">`+
                    '<pubsub xmlns="http://jabber.org/protocol/pubsub">'+
                        '<items node="storage:bookmarks"/>'+
                    '</pubsub>'+
                    '</iq>'
                );

                const stanza = $iq({'to': _converse.connection.jid, 'type':'result', 'id':sent_stanza.getAttribute('id')})
                    .c('pubsub', {'xmlns': Strophe.NS.PUBSUB})
                        .c('items', {'node': 'storage:bookmarks'})
                            .c('item', {'id': 'current'})
                                .c('storage', {'xmlns': 'storage:bookmarks'})
                                    .c('conference', {
                                        'name': 'The Play&apos;s the Thing',
                                        'autojoin': 'false',
                                        'jid': 'theplay@conference.shakespeare.lit'
                                    }).c('nick').t('JC').up().up()
                                    .c('conference', {
                                        'name': '1st Bookmark',
                                        'autojoin': 'false',
                                        'jid': 'first@conference.shakespeare.lit'
                                    }).c('nick').t('JC').up().up()
                                    .c('conference', {
                                        'autojoin': 'false',
                                        'jid': 'noname@conference.shakespeare.lit'
                                    }).c('nick').t('JC').up().up()
                                    .c('conference', {
                                        'name': 'Bookmark with a very very long name that will be shortened',
                                        'autojoin': 'false',
                                        'jid': 'longname@conference.shakespeare.lit'
                                    }).c('nick').t('JC').up().up()
                                    .c('conference', {
                                        'name': 'Another room',
                                        'autojoin': 'false',
                                        'jid': 'another@conference.shakespeare.lit'
                                    }).c('nick').t('JC').up().up();
                _converse.connection._dataRecv(test_utils.createRequest(stanza));

                await u.waitUntil(() => document.querySelectorAll('#chatrooms div.bookmarks.rooms-list .room-item').length);
                expect(document.querySelectorAll('#chatrooms div.bookmarks.rooms-list .room-item').length).toBe(5);
                let els = document.querySelectorAll('#chatrooms div.bookmarks.rooms-list .room-item a.list-item-link');
                expect(els[0].textContent).toBe("1st Bookmark");
                expect(els[1].textContent).toBe("Another room");
                expect(els[2].textContent).toBe("Bookmark with a very very long name that will be shortened");
                expect(els[3].textContent).toBe("noname@conference.shakespeare.lit");
                expect(els[4].textContent).toBe("The Play's the Thing");

                spyOn(window, 'confirm').and.returnValue(true);
                document.querySelector('#chatrooms .bookmarks.rooms-list .room-item:nth-child(2) a:nth-child(2)').click();
                expect(window.confirm).toHaveBeenCalled();
                await u.waitUntil(() => document.querySelectorAll('#chatrooms div.bookmarks.rooms-list .room-item').length === 4)
                els = document.querySelectorAll('#chatrooms div.bookmarks.rooms-list .room-item a.list-item-link');
                expect(els[0].textContent).toBe("1st Bookmark");
                expect(els[1].textContent).toBe("Bookmark with a very very long name that will be shortened");
                expect(els[2].textContent).toBe("noname@conference.shakespeare.lit");
                expect(els[3].textContent).toBe("The Play's the Thing");
                done();
            }));


            it("remembers the toggle state of the bookmarks list", mock.initConverse(
                    ['rosterGroupsFetched'], {}, async function (done, _converse) {

                await test_utils.openControlBox(_converse);
                await test_utils.waitUntilDiscoConfirmed(
                    _converse, _converse.bare_jid,
                    [{'category': 'pubsub', 'type': 'pep'}],
                    ['http://jabber.org/protocol/pubsub#publish-options']
                );

                const IQ_stanzas = _converse.connection.IQ_stanzas;
                const sent_stanza = await u.waitUntil(
                    () => IQ_stanzas.filter(s => sizzle('iq items[node="storage:bookmarks"]', s).length).pop());

                expect(Strophe.serialize(sent_stanza)).toBe(
                    `<iq from="romeo@montague.lit/orchard" id="${sent_stanza.getAttribute('id')}" type="get" xmlns="jabber:client">`+
                    '<pubsub xmlns="http://jabber.org/protocol/pubsub">'+
                        '<items node="storage:bookmarks"/>'+
                    '</pubsub>'+
                    '</iq>'
                );
                const stanza = $iq({'to': _converse.connection.jid, 'type':'result', 'id': sent_stanza.getAttribute('id')})
                    .c('pubsub', {'xmlns': Strophe.NS.PUBSUB})
                        .c('items', {'node': 'storage:bookmarks'})
                            .c('item', {'id': 'current'})
                                .c('storage', {'xmlns': 'storage:bookmarks'});
                _converse.connection._dataRecv(test_utils.createRequest(stanza));
                await _converse.api.waitUntil('bookmarksInitialized');

                _converse.bookmarks.create({
                    'jid': 'theplay@conference.shakespeare.lit',
                    'autojoin': false,
                    'name':  'The Play',
                    'nick': ''
                });
                const el = _converse.chatboxviews.el
                const selector = '#chatrooms .bookmarks.rooms-list .room-item';
                await u.waitUntil(() => sizzle(selector, el).filter(u.isVisible).length);
                expect(u.hasClass('collapsed', sizzle('#chatrooms .bookmarks.rooms-list', el).pop())).toBeFalsy();
                expect(sizzle(selector, el).filter(u.isVisible).length).toBe(1);
                expect(_converse.bookmarksview.list_model.get('toggle-state')).toBe(_converse.OPENED);
                sizzle('#chatrooms .bookmarks-toggle', el).pop().click();
                expect(u.hasClass('collapsed', sizzle('#chatrooms .bookmarks.rooms-list', el).pop())).toBeTruthy();
                expect(_converse.bookmarksview.list_model.get('toggle-state')).toBe(_converse.CLOSED);
                sizzle('#chatrooms .bookmarks-toggle', el).pop().click();
                expect(u.hasClass('collapsed', sizzle('#chatrooms .bookmarks.rooms-list', el).pop())).toBeFalsy();
                expect(sizzle(selector, el).filter(u.isVisible).length).toBe(1);
                expect(_converse.bookmarksview.list_model.get('toggle-state')).toBe(_converse.OPENED);
                done();
            }));
        });
    });

    describe("When hide_open_bookmarks is true and a bookmarked room is opened", function () {

        it("can be closed", mock.initConverse(
            ['rosterGroupsFetched'],
            { hide_open_bookmarks: true },
            async function (done, _converse) {

            await test_utils.openControlBox(_converse);
            await test_utils.waitUntilBookmarksReturned(_converse);

            // Check that it's there
            const jid = 'room@conference.example.org';
            _converse.bookmarks.create({
                'jid': jid,
                'autojoin': false,
                'name':  'The Play',
                'nick': ' Othello'
            });
            expect(_converse.bookmarks.length).toBe(1);

            const bmarks_view = _converse.bookmarksview;
            await u.waitUntil(() => bmarks_view.el.querySelectorAll(".open-room").length, 500);
            const room_els = bmarks_view.el.querySelectorAll(".open-room");
            expect(room_els.length).toBe(1);

            const bookmark = _converse.bookmarksview.el.querySelector(".open-room");
            bookmark.click();
            await u.waitUntil(() => _converse.chatboxviews.get(jid));

            expect(u.hasClass('hidden', _converse.bookmarksview.el.querySelector(".available-chatroom"))).toBeTruthy();
            // Check that it reappears once the room is closed
            const view = _converse.chatboxviews.get(jid);
            view.close();
            await u.waitUntil(() => !u.hasClass('hidden', _converse.bookmarksview.el.querySelector(".available-chatroom")));
            done();
        }));
    });
}));
