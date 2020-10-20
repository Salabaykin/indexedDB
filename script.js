ymaps.ready(function () {
        
    var myMap = new ymaps.Map('map', {
        center: [56.1902056,40.9057406],
        zoom: 10,
        controls: []
    }),
    objectManager = new ymaps.ObjectManager({
        clusterize: true,
        clusterDisableClickZoom: true,
        clusterIconLayout: 'default#pieChart',
        // Радиус диаграммы.
        iconPieChartRadius: 23,
        // Радиус центрального сектора диаграммы.
        iconPieChartCoreRadius: 17
    });
    myMap.geoObjects.add(objectManager);


    async function init(url, nameDB, dataStore, version, typeTX) {
        
        let indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        
        if (!indexedDB) {
            window.alert("Ваш браузер не поддерживат стабильную версию IndexedDB. Такие-то функции будут недоступны");
        }
            
        let request = indexedDB.open(nameDB, version);
        
        request.onupgradeneeded = function() {
            
            let db = request.result;
            db.createObjectStore(dataStore, {autoIncrement: true});
            
            $.ajax({
                url: url,
                dataType: 'json',
                beforeSend: function() {
                    $('.overlay').addClass('load');
                },
                complete: function() {
                    $('.overlay').removeClass('load');
                }
            }).done(function (data) {
                transaction(data);
            });
            
        };
        
        request.onsuccess = function() {
            
            let request1 = indexedDB.open(nameDB, version);
            request1.onsuccess = function() {
                list();
            };
            
        }

        async function transaction(data) {

            let request = await idb.openDb(nameDB, version);
            let transaction = request.transaction(dataStore, typeTX);
            let objectStore = transaction.objectStore(dataStore);
            
            try {
                await objectStore.add(data);
                await transaction.complete;
                await list();
            } catch(err) {
                console.log('Ошибка', err.message);
            }
            
        }
        
        async function list() {
            
            let request = await idb.openDb(nameDB, version);
            let transaction = request.transaction(dataStore, typeTX);
            let objectStore = transaction.objectStore(dataStore);
            let list = await objectStore.getAll();
            
            list.forEach(item => {
                objectManager.add(item);
            });
            
        }
        
    }
    
    const btnClear = document.querySelector('.button');

    btnClear.addEventListener('click', function() {
        
        let deleteRequest = indexedDB.deleteDatabase('stationsDB') && indexedDB.deleteDatabase('cityDB') && indexedDB.deleteDatabase('objectsDB');
        
        deleteRequest.onsuccess = function () {
            alert("Старая база данных успешно удалена") ? '' : location.reload();
        };
        deleteRequest.onerror = function () {
            alert("Не удалось удалить базу данных");
        };
        deleteRequest.onblocked = function () {
            alert("Не удалось удалить базу данных из-за блокировки операции") ? '' : location.reload();
        };
        
    });

    // Создадим 5 пунктов выпадающего списка.
    var listBoxItems = ['АЗС Татнефть', 'Населенные пункты', 'Нетопливные обьекты']
            .map(function (title) {
                return new ymaps.control.ListBoxItem({
                    data: {
                        content: title
                    },
                    state: {
                        selected: false
                    }
                })
            }),
        reducer = function (filters, filter) {
            filters[filter.data.get('content')] = filter.isSelected();
            return filters;
        },
        // Теперь создадим список, содержащий 5 пунктов.
        listBoxControl = new ymaps.control.ListBox({
            data: {
                content: 'Фильтр',
                title: 'Фильтр'
            },
            items: listBoxItems,
            state: {
                // Признак, развернут ли список.
                expanded: true,
                filters: listBoxItems.reduce(reducer, {})
            }
        });
    myMap.controls.add(listBoxControl);

    // Добавим отслеживание изменения признака, выбран ли пункт списка.
    listBoxControl.events.add(['select', 'deselect'], function (e) {

        var listBoxItem = e.get('target');
            
        if (listBoxItem.data.get('content') == 'АЗС Татнефть') {
            init('http://tatneft.beget.tech/ajax/ajax.php?hb_id=6&uf_type=stations', 'stationsDB', 'stations', 1, 'readwrite');
        }

        if (listBoxItem.data.get('content') == 'Населенные пункты') {
            init('http://tatneft.beget.tech/ajax/ajax.php?hb_id=4&uf_type=city', 'cityDB', 'city', 1, 'readwrite');
        }
        
        if (listBoxItem.data.get('content') == 'Нетопливные обьекты') {
            init('http://tatneft.beget.tech/ajax/ajax.php?hb_id=10&uf_type=objects', 'objectsDB', 'objects', 1, 'readwrite');
        }

        var filters = ymaps.util.extend({}, listBoxControl.state.get('filters'));
        filters[listBoxItem.data.get('content')] = listBoxItem.isSelected();
        listBoxControl.state.set('filters', filters);

    });

    var filterMonitor = new ymaps.Monitor(listBoxControl.state);
    filterMonitor.add('filters', function (filters) {
        // Применим фильтр.
        objectManager.setFilter(getFilterFunction(filters));
    });

    function getFilterFunction(categories) {
        return function (obj) {
            var content = obj.properties.typeList;
            return categories[content]
        }
    }

    objectManager.objects.events.add('balloonopen', function (e) {
        // Получим объект, на котором открылся балун.
        var id = e.get('objectId'),
            geoObject = objectManager.objects.getById(id);
        // Загрузим данные для объекта при необходимости.
        downloadContent([geoObject], id);
    });

    objectManager.clusters.events.add('balloonopen', function (e) {
        // Получим id кластера, на котором открылся балун.
        var id = e.get('objectId'),
        // Получим геообъекты внутри кластера.
            cluster = objectManager.clusters.getById(id),
            geoObjects = cluster.properties.geoObjects;

        // Загрузим данные для объектов при необходимости.
        downloadContent(geoObjects, id, true);
    });

    function downloadContent(geoObjects, id, isCluster) {
        // Создадим массив меток, для которых данные ещё не загружены.
        var array = geoObjects.filter(function (geoObject) {
                    return geoObject.properties.balloonContent === 'идет загрузка...' ||
                        geoObject.properties.balloonContent === 'Not found';
                }),
        // Формируем массив идентификаторов, который будет передан серверу.
            ids = array.map(function (geoObject) {
                    return geoObject.id;
                });
        if (1==1) {
            ymaps.vow.resolve($.ajax({
                    url: 'http://tatneft.beget.tech/ajax/ajax_content.php?hb_id=6&elem_id='+id,
                    type: 'GET',
                    dataType: 'json',
                    processData: false
                })).then(
                    function (data) {
                        geoObjects.forEach(function (geoObject) {
                            // Содержимое балуна берем из данных, полученных от сервера.
                            // Сервер возвращает массив объектов вида:
                            // [ {"balloonContent": "Содержимое балуна"}, ...]
                            geoObject.properties.balloonContent = data[0].balloonContent;
                        });
                        // Оповещаем балун, что нужно применить новые данные.
                        setNewData();
                        tabs();
                    }, function () {
                        geoObjects.forEach(function (geoObject) {
                            geoObject.properties.balloonContent = 'Not found';
                        });
                        // Оповещаем балун, что нужно применить новые данные.
                        setNewData();
                    }
                );
        }

        function setNewData(){
            if (isCluster && objectManager.clusters.balloon.isOpen(id)) {
                objectManager.clusters.balloon.setData(objectManager.clusters.balloon.getData());
            } else if (objectManager.objects.balloon.isOpen(id)) {
                objectManager.objects.balloon.setData(objectManager.objects.balloon.getData());
            }
        }
    }
    
    function tabs() {
        // Tabs
        class Tabs {
        constructor(button, content) {
            this.button = button;
            this.content = content;
        }
        
        render() {
            const showTabs = (el) => {
            const btnTarget = el.currentTarget;
            const country = btnTarget.dataset.country;
            this.content.forEach((el) => {
                this.removeClass(el);
            });
            this.button.forEach((el) => {
                this.removeClass(el);
            });
            document.querySelector('#' + country).classList.add('active');
            btnTarget.classList.add('active');
            }
        
            this.button.forEach(function(el) {
            el.addEventListener("click", showTabs);
            });
        }
        
        removeClass(el) {
            el.classList.remove('active');
        }
        
        }
        
        // Tabs
        const tabLinks = document.querySelectorAll('.info-tabs__link'),
              tabContent = document.querySelectorAll('.info-tabs__content');
        
        const tabs = new Tabs(tabLinks, tabContent);
        tabs.render();
    }

});
