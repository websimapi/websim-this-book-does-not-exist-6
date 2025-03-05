const { useState, useEffect, useRef, useMemo, useSyncExternalStore, useCallback } = React;
const { createRoot } = ReactDOM;

// Main App component
const App = () => {
  const [room] = useState(() => new WebsimSocket());
  const [activeTab, setActiveTab] = useState('create');
  const [selectedBook, setSelectedBook] = useState(null);
  const [creatorUsername, setCreatorUsername] = useState('');

  useEffect(() => {
    const getCreator = async () => {
      try {
        const creator = await window.websim.getCreatedBy();
        setCreatorUsername(creator.username);
      } catch (error) {
        console.error('Error getting creator:', error);
      }
    };
    
    getCreator();
  }, []);

  // Book creation form component
  const BookCreatorForm = () => {
    const [loading, setLoading] = useState(false);
    const [bookData, setBookData] = useState({
      title: '',
      author: '',
      genre: [],
      year: new Date().getFullYear(),
      pages: 300,
      prompt: ''
    });
    const [creationStatus, setCreationStatus] = useState('');

    const handleInputChange = (e) => {
      const { name, value } = e.target;
      setBookData({ ...bookData, [name]: value });
    };

    const handleGenreChange = (e) => {
      const value = e.target.value;
      if (value && !bookData.genre.includes(value) && value !== "select") {
        setBookData({ ...bookData, genre: [...bookData.genre, value] });
      }
    };

    const removeGenre = (genreToRemove) => {
      setBookData({
        ...bookData,
        genre: bookData.genre.filter(genre => genre !== genreToRemove)
      });
    };

    const generateBook = async (e) => {
      e.preventDefault();
      
      if (!bookData.title || !bookData.author || !bookData.prompt) {
        alert('Please fill in all required fields');
        return;
      }
      
      setLoading(true);
      setCreationStatus('Generating book description...');
      
      try {
        // Generate book description and synopsis
        const bookDescription = await generateBookDescription(bookData);
        setCreationStatus('Generating book cover image...');
        
        // Generate book cover using the description
        const coverImageUrl = await generateBookCover(bookData, bookDescription);
        
        // Save the book to the database
        await room.collection('book').create({
          ...bookData,
          genreList: bookData.genre,
          description: bookDescription,
          coverUrl: coverImageUrl,
          creator: room.party.client.username
        });
        
        // Reset the form
        setBookData({
          title: '',
          author: '',
          genre: [],
          year: new Date().getFullYear(),
          pages: 300,
          prompt: ''
        });
        
        setCreationStatus('Book created successfully!');
        setTimeout(() => setCreationStatus(''), 3000);
      } catch (error) {
        console.error('Error creating book:', error);
        setCreationStatus('Error creating book. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    // Generate book description using LLM
    const generateBookDescription = async (bookInfo) => {
      const completion = await websim.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a creative book description generator. Create a detailed and engaging description for a fictional book. Include a brief synopsis, themes, writing style, and something about the fictional author's background or inspiration. Be detailed, imaginative, and sound like a professional book description."
          },
          {
            role: "user",
            content: `Generate a description for a book with the following information:
              Title: ${bookInfo.title}
              Author: ${bookInfo.author}
              Genre: ${bookInfo.genre.join(', ')}
              Year Published: ${bookInfo.year}
              Length: ${bookInfo.pages} pages
              Additional notes: ${bookInfo.prompt}
              
              Format the output as a detailed book description of 3-4 paragraphs.`
          }
        ]
      });
      
      return completion.content;
    };

    // Generate book cover using the book description
    const generateBookCover = async (bookInfo, description) => {
      const imagePrompt = `Book cover for "${bookInfo.title}" by ${bookInfo.author}. The book is a ${bookInfo.genre.join(', ')} novel. ${bookInfo.prompt}. Design a professional-looking book cover with the title and author name visible.`;
      
      const result = await websim.imageGen({
        prompt: imagePrompt,
        aspect_ratio: "2:3",
      });
      
      return result.url;
    };

    return (
      <div className="book-creator">
        <h2>Create a Book That Doesn't Exist</h2>
        <form onSubmit={generateBook}>
          <div className="form-group">
            <label htmlFor="title">Book Title*</label>
            <input
              type="text"
              id="title"
              name="title"
              value={bookData.title}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="author">Author Name*</label>
            <input
              type="text"
              id="author"
              name="author"
              value={bookData.author}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="genre">Genres</label>
            <select
              id="genre"
              name="genre"
              onChange={handleGenreChange}
              value="select"
            >
              <option value="select">Select genres...</option>
              <option value="Fantasy">Fantasy</option>
              <option value="Science Fiction">Science Fiction</option>
              <option value="Mystery">Mystery</option>
              <option value="Thriller">Thriller</option>
              <option value="Romance">Romance</option>
              <option value="Horror">Horror</option>
              <option value="Historical Fiction">Historical Fiction</option>
              <option value="Literary Fiction">Literary Fiction</option>
              <option value="Young Adult">Young Adult</option>
              <option value="Dystopian">Dystopian</option>
              <option value="Memoir">Memoir</option>
              <option value="Biography">Biography</option>
              <option value="Self-Help">Self-Help</option>
              <option value="Philosophy">Philosophy</option>
              <option value="Poetry">Poetry</option>
            </select>
            
            {bookData.genre.length > 0 && (
              <div className="book-genres">
                {bookData.genre.map((genre, index) => (
                  <span key={index} className="genre-tag">
                    {genre} <button type="button" onClick={() => removeGenre(genre)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="year">Publication Year</label>
            <input
              type="number"
              id="year"
              name="year"
              value={bookData.year}
              onChange={handleInputChange}
              min="1500"
              max="2100"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="pages">Page Count</label>
            <input
              type="number"
              id="pages"
              name="pages"
              value={bookData.pages}
              onChange={handleInputChange}
              min="10"
              max="2000"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="prompt">Additional Details/Prompt*</label>
            <textarea
              id="prompt"
              name="prompt"
              value={bookData.prompt}
              onChange={handleInputChange}
              placeholder="Describe what makes this book special, its themes, setting, or any specific details you want to include..."
              required
            ></textarea>
          </div>
          
          <button type="submit" disabled={loading}>
            Generate Book
          </button>
          
          {loading && (
            <div className="loading">
              <div className="spinner"></div>
              <span>{creationStatus}</span>
            </div>
          )}
          
          {!loading && creationStatus && (
            <div className="creation-status">{creationStatus}</div>
          )}
        </form>
      </div>
    );
  };

  // Book Gallery component
  const BookGallery = () => {
    const books = useSyncExternalStore(
      room.collection('book').subscribe,
      () => room.collection('book').getList()
    );
    
    const sortedBooks = useMemo(() => {
      return [...books].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [books]);

    const openBookDetail = (book) => {
      setSelectedBook(book);
    };

    if (sortedBooks.length === 0) {
      return (
        <div className="empty-gallery">
          <h3>No books yet!</h3>
          <p>Be the first to create a book that doesn't exist.</p>
        </div>
      );
    }

    return (
      <div className="gallery">
        {sortedBooks.map((book) => (
          <div key={book.id} className="book" onClick={() => openBookDetail(book)}>
            <div className="book-inner">
              <div className="book-cover">
                <div 
                  className="book-cover-image" 
                  style={{ backgroundImage: `url(${book.coverUrl})` }}
                ></div>
                <div className="book-cover-details">
                  <h3 className="book-title">{book.title}</h3>
                  <p className="book-author">by {book.author}</p>
                </div>
              </div>
              <div className="book-spine">
                <div className="spine-text">{book.title} - {book.author}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Book Detail Modal
  const BookDetailModal = ({ book, onClose }) => {
    if (!book) return null;

    return (
      <div className="book-modal">
        <div className="modal-content">
          <button className="close-modal" onClick={onClose}>×</button>
          <img src={book.coverUrl} alt={book.title} className="modal-image" />
          <h2 className="modal-title">{book.title}</h2>
          <p className="modal-author">by {book.author}</p>
          
          <div className="modal-info">
            <p><strong>Published:</strong> {book.year}</p>
            <p><strong>Pages:</strong> {book.pages}</p>
            <p><strong>Genres:</strong> {book.genreList.join(', ')}</p>
          </div>
          
          <div className="modal-description">
            {book.description.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
          
          <p className="modal-creator">Generated by {book.creator}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <header>
        <h1>This Book Does Not Exist</h1>
        <p>Generate fictional books with AI</p>
      </header>
      
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          Create a Book
        </button>
        <button 
          className={`tab ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          Browse Gallery
        </button>
      </div>
      
      {activeTab === 'create' ? <BookCreatorForm /> : <BookGallery />}
      
      {selectedBook && (
        <BookDetailModal 
          book={selectedBook} 
          onClose={() => setSelectedBook(null)} 
        />
      )}
    </div>
  );
};

// Render the app
const root = createRoot(document.getElementById('app'));
root.render(<App />);

