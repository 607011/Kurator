const HOST = (function(window) {
    switch (window.location.hostname) {
        case 'kurator.raetselonkel.de': return 'https://kurator.raetselonkel.de/v1/api';
        default: return 'http://127.0.0.1:18081';
    }
})(window);


(function(window) {
    'use strict';

    Number.prototype.clamp = function(lo, hi) {
        return Math.max(lo, Math.min(this, hi));
    }

    class Corpus {
        static URL = {
            CORPUS: `${HOST}/corpus`,
            WORD: {
                ADD: `${HOST}/word/add`,
                DELETE: `${HOST}/word/delete`,
            },
        }
        constructor() {
            this.sortCollator = new Intl.Collator('de',
            {
                caseFirst: 'false',
                sensitivity: 'base',
                collation: 'phonebk',
                usage: 'sort'
            });
            this.searchCollator = new Intl.Collator('de',
            {
                caseFirst: 'false',
                sensitivity: 'base',
                collation: 'phonebk',
                usage: 'search'
            });
        }
        async fetchAll() {
            const reply = await fetch(Corpus.URL.CORPUS, {
                    method: 'GET',
                    cache: 'no-cache',
                    mode: 'cors',
                    credentials: 'same-origin',
                }
            )
            .then(response => response.json());
            this._words = null;
            if (reply.ok && reply.words instanceof Array) {
                this._words = reply.words;
                this._words.sort((a, b) => this.sortCollator.compare(a.word, b.word));
            }
        }
        async #sendWord(word, description, tags) {
            return fetch(Corpus.URL.WORD.ADD, {
                method: 'POST',
                cache: 'no-cache',
                mode: 'cors',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    word: word,
                    description: description,
                    tags: tags,
                }),
            })
            .then(response => response.json());
        }
        async #deleteWord(word) {
            return fetch(Corpus.URL.WORD.DELETE, {
                method: 'POST',
                cache: 'no-cache',
                mode: 'cors',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    word: word,
                }),
            })
            .then(response => response.json());
        }
        deleteWord(word) {
            const idx = this.closestIndexOf(word);
            const doDelete = this.compare(corpus.words[idx].word, word) === 0;
            if (doDelete) {
                this._words.splice(idx, 1);
                this.#deleteWord(word);
            }
            return doDelete;
        }
        addWord(word, description, tags) {
            const idx = this.closestIndexOf(word);
            const doAdd = this.compare(corpus.words[idx].word, word) !== 0;
            if (doAdd) {
                this._words.splice(idx, 0, { word: word, description: description, tags: tags });
                this.#sendWord(word, description, tags);
            }
            return doAdd;
        }
        compare(a, b) {
            return this.searchCollator.compare(a, b)
        }
        closestIndexOf(word) {
            if (word.length === 0) {
                return -1;
            }
            let lo = 0;
            let hi = this.size;
            while (lo <= hi) {
                const pos = (lo + hi) >> 1;
                if (pos === this.size) {
                    return -1;
                }
                const other = this._words[pos].word;
                if (this.compare(word, other) < 0) {
                    if (pos > 0 && this.compare(word, this._words[pos-1].word) > 0) {
                        return pos;
                    }
                    hi = pos - 1;
                }
                else if (this.compare(word, other) > 0) {
                    if (pos < this.size-1 && this.compare(word, this._words[pos+1].word) < 0) {
                        return pos+1;
                    }
                    lo = pos + 1;
                }
                else {
                    return pos;
                }
            }
            return -1;
        }
        indexOf(word) {
            if (word.length === 0) {
                return -1;
            }
            let lo = 0;
            let hi = this.size;
            while (lo <= hi) {
                const pos = (lo + hi) >> 1;
                const other = this._words[pos].word;
                if (this.compare(word, other) < 0) {
                    hi = pos - 1;
                }
                else if (this.compare(word, other) > 0) {
                    lo = pos + 1;
                }
                else {
                    return pos;
                }
            }
            return -1;
        }
        get words() {
            return this._words;
        }
        get size() {
            return this._words.length;
        }
    }

    const N_AROUND = 3;
    let corpus, el, currentIdx = -1;
    let predecessors = [];
    let successors = [];
    let tags = [];

    function updateList() {
        const offset = el.predecessors.length - predecessors.length;
        for (let i = 0; i < offset; ++i) {
            el.predecessors[i].textContent = '';
        }
        for (let i = 0; i < Math.min(el.predecessors.length, predecessors.length); ++i) {
            el.predecessors[i+offset].textContent = predecessors[i].word;
        }
        for (let i = 0; i < el.successors.length; ++i) {
            el.successors[i].textContent = successors[i] ? successors[i].word : '';
        }
    }

    function update(word) {
        currentIdx = corpus.closestIndexOf(word);
        const match = currentIdx >= 0 && corpus.compare(corpus.words[currentIdx].word, word) === 0;
        if (word.length > 0 && currentIdx >= 0) {
            predecessors = corpus.words.slice(Math.max(0, currentIdx-N_AROUND), currentIdx);
            successors = corpus.words.slice(match?currentIdx+1:currentIdx, Math.min((match?currentIdx+1:currentIdx)+N_AROUND, corpus.size));
        }
        else {
            predecessors = [];
            successors = [];
        }
        if (match) {
            el.wordInput.classList.add('match');
            const description = corpus.words[currentIdx].description
            ? corpus.words[currentIdx].description
            : '';
            el.descriptionInput.value = description.replaceAll('&shy;', '|');
        }
        else {
            el.wordInput.classList.remove('match');
            el.descriptionInput.value = '';
        }
        updateList();
    }

    function onWordChange(e) {
        update(e.target.value);
    }

    function onKeyUp(e) {
        if (e.key === 'Enter' && e.shiftKey) {
            const word = el.wordInput.value;
            if (word.length > 0 && successors.length > 0 && corpus.compare(word, successors[0].word) !== 0) {
                const description = el.descriptionInput.value === ''
                ? null
                : el.descriptionInput.value.replaceAll('\xAD', '&shy;').replaceAll('|', '&shy;').replaceAll('\\', '&shy;');
                const added = corpus.addWord(word, description, tags);
                if (added) {
                    update(word);
                    el.wordInput.select();
                    console.log(`added word „${word}“.`)
                }
            }
        }
    }

    function onMouseWheel(e) {
        if (corpus.size > 0 && currentIdx >= 0) {
            const idx = (currentIdx + Math.floor(e.deltaY / 2)).clamp(0, corpus.size-1);
            const word = corpus.words[idx].word;
            if (word && word.length > 0) {
                el.wordInput.value = word;
                update(word);
            }
        }
        e.preventDefault();
    }

    function onDescriptionPaste(e) {
        e.preventDefault();
        let pasted = (e.clipboardData || window.clipboardData).getData('text');
        el.descriptionInput.value = pasted.replaceAll('\xAD', '|');
    }

    function onDeleteWord(e) {
        const left = e.target.previousSibling;
        const word = left instanceof HTMLInputElement ? left.value : left.textContent;
        if (word.length > 0) {
            const wordIdx = corpus.indexOf(word);
            if (wordIdx >= 0) {
                const deleted = corpus.deleteWord(word);
                if (deleted) {
                    console.log(`deleted word „${word}“.`)
                    if (left instanceof HTMLInputElement) {
                        el.wordInput.value = successors.length > 0 
                        ? successors[0].word
                        : predecessors[successors.length-1].word;
                    }
                    update(el.wordInput.value);
                }
            }    
        }
    }

    function onDeleteTag(e) {
        const label = e.target.getAttribute('data-item');
        const idx = tags.indexOf(label);
        if (idx >= 0) {
            e.target.parentElement.remove();
            tags.splice(idx, 1);
            localStorage.setItem('tags', JSON.stringify(tags));
        }
    }

    function createTag(label) {
        const div = document.createElement('div');
        div.className = 'tag';
        const span = document.createElement('span');
        span.textContent = label;
        const delIcn = document.createElement('span');
        delIcn.textContent = '✖️';
        delIcn.className = 'delete';
        delIcn.setAttribute('data-item', label);
        delIcn.addEventListener('click', onDeleteTag);
        div.appendChild(span);
        div.appendChild(delIcn);
        return div;
    }

    function addTag(label) {
        el.tagContainer.insertBefore(createTag(label), el.tagInput);
        tags.push(label);
    }

    function onTagEnter(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            addTag(el.tagInput.value);
            el.tagInput.value = '';
            localStorage.setItem('tags', JSON.stringify(tags));
        }
    }

    function onWordClick(e) {
        el.wordInput.value = e.target.textContent;
        update(el.wordInput.value);
    }

    function initList() {
        let makeDel = () => {
            const del = document.createElement('span');
            del.addEventListener('click', onDeleteWord);
            del.textContent = '✖️';
            del.className = 'delete';
            return del;
        };
        for (let i = 0; i < N_AROUND; ++i) {
            const word = document.createElement('span');
            word.addEventListener('click', onWordClick);
            el.predecessors.push(word)
            el.main.appendChild(word);
            el.main.appendChild(makeDel());
        }
        el.wordInput = document.createElement('input');
        el.wordInput.id = 'word';
        el.wordInput.name = 'word';
        el.wordInput.placeholder = 'Wort hier eingeben …';
        el.wordInput.tabIndex = 1;
        el.wordInput.type = 'text';
        el.wordInput.disabled = true;
        el.wordInput.addEventListener('input', onWordChange);
        el.wordInput.addEventListener('change', onWordChange);
        el.main.append(el.wordInput);
        el.main.append(makeDel());
        for (let i = 0; i < N_AROUND; ++i) {
            const word = document.createElement('span');
            word.addEventListener('click', onWordClick);
            el.successors.push(word)
            el.main.append(word);
            el.main.append(makeDel());
        }
    }

    function onLoad() {
        document.querySelectorAll('[disabled]').forEach(el => el.removeAttribute('disabled'));
        window.addEventListener('keyup', onKeyUp);
        el.wordInput.focus();
    }

    async function main() {
        corpus = new Corpus();
        corpus.fetchAll().then(onLoad);
        el = {
            main: document.getElementById('main'),
            descriptionInput: document.getElementById('description'),
            wordInput: null,
            predecessors: [],
            successors: [],
            tagContainer: document.querySelector('.tag-container'),
            tagInput: document.querySelector('.tag-container input'),
        };
        el.main.addEventListener('wheel', onMouseWheel);
        el.descriptionInput.addEventListener('paste', onDescriptionPaste);
        el.tagInput.addEventListener('keyup', onTagEnter);
        initList();
        const tags = JSON.parse(localStorage.getItem('tags') || '[]').sort();
        for (let tag of tags) {
            addTag(tag);
        }
    }
    window.addEventListener('load', main);
})(window);
